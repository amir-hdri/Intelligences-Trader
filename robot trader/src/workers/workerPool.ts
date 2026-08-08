interface QueuedTask {
  id: string;
  type: string;
  payload: unknown;
}

interface PendingTask<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class WorkerPool {
  private readonly workerScriptUrl: URL | string;
  private workers: Worker[] = [];
  private taskQueue: QueuedTask[] = [];
  private activeWorkers = new Map<Worker, string | null>();
  private idleWorkers: Worker[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private messageCounter = 0;
  private terminated = false;

  constructor(
    workerScriptUrl: URL | string,
    poolSize: number = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
  ) {
    if (typeof Worker === 'undefined') throw new Error('Web Workers are not available in this environment');
    if (!Number.isInteger(poolSize) || poolSize < 1) throw new Error('Worker pool size must be a positive integer');

    this.workerScriptUrl = workerScriptUrl;
    for (let i = 0; i < poolSize; i++) this.addWorker();
  }

  private createWorker(): Worker {
    const worker = new Worker(this.workerScriptUrl, { type: 'module' });
    worker.onmessage = event => this.handleMessage(event, worker);
    worker.onerror = error => this.handleError(error.message || 'Worker execution failed', worker);
    worker.onmessageerror = () => this.handleError('Worker returned an unserializable message', worker);
    return worker;
  }

  private addWorker(replace?: Worker): void {
    if (this.terminated) return;
    const worker = this.createWorker();
    if (replace) {
      this.workers = this.workers.map(existing => existing === replace ? worker : existing);
    } else {
      this.workers.push(worker);
    }
    this.activeWorkers.set(worker, null);
    this.idleWorkers.push(worker);
  }

  private handleMessage(event: MessageEvent, worker: Worker): void {
    const activeTaskId = this.activeWorkers.get(worker);
    const { id, result, error } = event.data ?? {};
    if (!activeTaskId || id !== activeTaskId) return;

    const task = this.pendingTasks.get(id);
    if (task) {
      clearTimeout(task.timeout);
      this.pendingTasks.delete(id);
      if (error) task.reject(new Error(String(error)));
      else task.resolve(result);
    }

    this.activeWorkers.set(worker, null);
    if (!this.idleWorkers.includes(worker)) this.idleWorkers.push(worker);
    this.processQueue();
  }

  private handleError(message: string, worker: Worker): void {
    const taskId = this.activeWorkers.get(worker);
    if (taskId) {
      const task = this.pendingTasks.get(taskId);
      if (task) {
        clearTimeout(task.timeout);
        task.reject(new Error(message));
        this.pendingTasks.delete(taskId);
      }
    }

    this.activeWorkers.delete(worker);
    this.idleWorkers = this.idleWorkers.filter(existing => existing !== worker);
    worker.terminate();

    try {
      this.addWorker(worker);
    } catch (error) {
      this.workers = this.workers.filter(existing => existing !== worker);
      console.error('Failed to re-initialize worker', error);
    }
    this.processQueue();
  }

  public executeTask<T>(type: string, payload: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.terminated) return Promise.reject(new Error('Worker pool is terminated'));
    if (!type) return Promise.reject(new Error('Worker task type is required'));

    const id = `task_${Date.now()}_${this.messageCounter++}`;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const task = this.pendingTasks.get(id);
        if (!task) return;
        this.pendingTasks.delete(id);
        this.taskQueue = this.taskQueue.filter(queued => queued.id !== id);
        task.reject(new Error(`Worker task "${type}" timed out after ${timeoutMs}ms`));

        const activeWorker = [...this.activeWorkers.entries()].find(([, taskId]) => taskId === id)?.[0];
        if (activeWorker) this.handleError(`Worker task "${type}" timed out`, activeWorker);
      }, timeoutMs);

      this.pendingTasks.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
      this.taskQueue.push({ id, type, payload });
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (!this.terminated && this.taskQueue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.shift();
      const task = this.taskQueue.shift();
      if (!worker || !task) break;

      // A queued task may have timed out just before dispatch.
      if (!this.pendingTasks.has(task.id)) {
        this.idleWorkers.push(worker);
        continue;
      }

      this.activeWorkers.set(worker, task.id);
      try {
        worker.postMessage(task);
      } catch (error) {
        this.handleError(error instanceof Error ? error.message : 'Failed to post task to worker', worker);
      }
    }
  }

  public terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.activeWorkers.clear();
    this.idleWorkers = [];
    for (const task of this.pendingTasks.values()) {
      clearTimeout(task.timeout);
      task.reject(new Error('Worker pool terminated'));
    }
    this.pendingTasks.clear();
    this.taskQueue = [];
  }
}
