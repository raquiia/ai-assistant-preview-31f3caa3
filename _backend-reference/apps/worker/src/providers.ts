export interface StorageProvider {
  putObject(key: string, data: Buffer, contentType: string): Promise<{ uri: string }>;
  getObject(key: string): Promise<Buffer>;
}

export interface QueueProvider<T = unknown> {
  enqueue(name: string, payload: T): Promise<void>;
  process(handler: (name: string, payload: T) => Promise<void>): Promise<void>;
}

export interface ObservabilityProvider {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export class LocalObjectStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, { data: Buffer; contentType: string }>();

  async putObject(key: string, data: Buffer, contentType: string): Promise<{ uri: string }> {
    this.objects.set(key, { data, contentType });
    return { uri: `minio://mp-knowledge/${key}` };
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`Object not found: ${key}`);
    return object.data;
  }
}

export class InMemoryQueueProvider<T = unknown> implements QueueProvider<T> {
  private readonly jobs: Array<{ name: string; payload: T }> = [];

  async enqueue(name: string, payload: T): Promise<void> {
    this.jobs.push({ name, payload });
  }

  async process(handler: (name: string, payload: T) => Promise<void>): Promise<void> {
    while (this.jobs.length) {
      const job = this.jobs.shift()!;
      await handler(job.name, job.payload);
    }
  }
}

export class ConsoleObservabilityProvider implements ObservabilityProvider {
  info(message: string, metadata?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: "info", message, metadata, ts: new Date().toISOString() }));
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: "error", message, metadata, ts: new Date().toISOString() }));
  }
}
