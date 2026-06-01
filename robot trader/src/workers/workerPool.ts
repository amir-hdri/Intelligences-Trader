export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: { id: string; type: string; payload: any }[] = [];
  private activeWorkers: Map<Worker, string | null> = new Map();
  private pendingTasks = new Map<string, { resolve: Function; reject: Function }>();
  private messageCounter = 0;

  constructor(workerScriptUrl: URL | string, poolSize: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerScriptUrl, { type: 'module' });

      worker.onmessage = (event) => this.handleMessage(event, worker);
      worker.onerror = (error) => this.handleError(error, worker);

      this.workers.push(worker);
      this.activeWorkers.set(worker, null);
    }
  }

  private handleMessage(event: MessageEvent, worker: Worker) {
    const { id, result, error } = event.data;
    const task = this.pendingTasks.get(id);

    if (task) {
      this.pendingTasks.delete(id);
      if (error) {
        task.reject(new Error(error));
      } else {
        task.resolve(result);
      }
    }

    this.activeWorkers.set(worker, null);
    this.processQueue();
  }

  private handleError(error: ErrorEvent, worker: Worker) {
    const taskId = this.activeWorkers.get(worker);
    if (taskId) {
       const task = this.pendingTasks.get(taskId);
       if (task) {
           task.reject(new Error(error.message));
           this.pendingTasks.delete(taskId);
       }
       this.activeWorkers.set(worker, null);
    }
    this.processQueue();
  }

  public async executeTask<T>(type: string, payload: any): Promise<T> {
    const id = `task_${Date.now()}_${this.messageCounter++}`;

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, { resolve, reject });
      this.taskQueue.push({ id, type, payload });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    let availableWorker: Worker | null = null;
    for (const [worker, taskId] of this.activeWorkers.entries()) {
      if (taskId === null) {
        availableWorker = worker;
        break;
      }
    }

    if (availableWorker) {
      const task = this.taskQueue.shift();
      if (task) {
        this.activeWorkers.set(availableWorker, task.id);
        availableWorker.postMessage({ id: task.id, type: task.type, payload: task.payload });
      }
    }
  }

  public terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.activeWorkers.clear();
    for (const [id, task] of this.pendingTasks.entries()) {
        task.reject(new Error("Worker pool terminated"));
    }
    this.pendingTasks.clear();
    this.taskQueue = [];
  }
}
