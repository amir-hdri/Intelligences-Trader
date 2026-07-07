"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerPool = void 0;
class WorkerPool {
    workerScriptUrl;
    workers = [];
    taskQueue = [];
    activeWorkers = new Map();
    idleWorkers = []; // Track idle workers directly
    pendingTasks = new Map();
    messageCounter = 0;
    constructor(workerScriptUrl, poolSize = navigator.hardwareConcurrency || 4) {
        this.workerScriptUrl = workerScriptUrl;
        for (let i = 0; i < poolSize; i++) {
            const worker = new Worker(workerScriptUrl, { type: 'module' });
            worker.onmessage = (event) => this.handleMessage(event, worker);
            worker.onerror = (error) => this.handleError(error, worker);
            this.workers.push(worker);
            this.activeWorkers.set(worker, null);
            this.idleWorkers.push(worker);
        }
    }
    handleMessage(event, worker) {
        const { id, result, error } = event.data;
        const task = this.pendingTasks.get(id);
        if (task) {
            this.pendingTasks.delete(id);
            if (error) {
                task.reject(new Error(error));
            }
            else {
                task.resolve(result);
            }
        }
        this.activeWorkers.set(worker, null);
        this.idleWorkers.push(worker);
        this.processQueue();
    }
    handleError(error, worker) {
        const taskId = this.activeWorkers.get(worker);
        if (taskId) {
            const task = this.pendingTasks.get(taskId);
            if (task) {
                task.reject(new Error(error.message));
                this.pendingTasks.delete(taskId);
            }
        }
        // Remove the failed worker from lists and terminate it
        this.activeWorkers.delete(worker);
        this.idleWorkers = this.idleWorkers.filter(w => w !== worker);
        worker.terminate();
        // Re-create replacement worker
        try {
            const newWorker = new Worker(this.workerScriptUrl, { type: 'module' });
            newWorker.onmessage = (event) => this.handleMessage(event, newWorker);
            newWorker.onerror = (err) => this.handleError(err, newWorker);
            this.workers = this.workers.map(w => w === worker ? newWorker : w);
            this.activeWorkers.set(newWorker, null);
            this.idleWorkers.push(newWorker);
        }
        catch (e) {
            console.error("Failed to re-initialize worker", e);
        }
        this.processQueue();
    }
    async executeTask(type, payload) {
        const id = `task_${Date.now()}_${this.messageCounter++}`;
        return new Promise((resolve, reject) => {
            this.pendingTasks.set(id, { resolve, reject });
            this.taskQueue.push({ id, type, payload });
            this.processQueue();
        });
    }
    processQueue() {
        if (this.taskQueue.length === 0)
            return;
        // Fast check for idle workers
        if (this.idleWorkers.length > 0) {
            const availableWorker = this.idleWorkers.shift();
            if (availableWorker) {
                const task = this.taskQueue.shift();
                if (task) {
                    this.activeWorkers.set(availableWorker, task.id);
                    availableWorker.postMessage({ id: task.id, type: task.type, payload: task.payload });
                }
                else {
                    // If shift returns undefined for some reason, put worker back
                    this.idleWorkers.push(availableWorker);
                }
            }
        }
    }
    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.activeWorkers.clear();
        this.idleWorkers = [];
        for (const [id, task] of this.pendingTasks.entries()) {
            task.reject(new Error("Worker pool terminated"));
        }
        this.pendingTasks.clear();
        this.taskQueue = [];
    }
}
exports.WorkerPool = WorkerPool;
