import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { WorkerPool } from './workerPool';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  posted: Array<{ id: string; type: string; payload: unknown }> = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(message: { id: string; type: string; payload: unknown }): void {
    this.posted.push(message);
  }

  respond(result: unknown): void {
    const task = this.posted.shift();
    if (!task) throw new Error('No posted task');
    this.onmessage?.({ data: { id: task.id, result } } as MessageEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const originalWorker = globalThis.Worker;

describe('WorkerPool', () => {
  afterEach(() => {
    globalThis.Worker = originalWorker;
    MockWorker.instances = [];
  });

  test('dispatches queued work across all idle workers', async () => {
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    const pool = new WorkerPool('worker.js', 2);

    const first = pool.executeTask<number>('first', { value: 1 });
    const second = pool.executeTask<number>('second', { value: 2 });

    assert.strictEqual(MockWorker.instances[0].posted.length, 1);
    assert.strictEqual(MockWorker.instances[1].posted.length, 1);
    MockWorker.instances[0].respond(1);
    MockWorker.instances[1].respond(2);

    assert.deepStrictEqual(await Promise.all([first, second]), [1, 2]);
    pool.terminate();
  });

  test('rejects pending tasks when terminated', async () => {
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    const pool = new WorkerPool('worker.js', 1);
    const pending = pool.executeTask('never-finishes', {});
    pool.terminate();
    await assert.rejects(pending, /Worker pool terminated/);
  });
});
