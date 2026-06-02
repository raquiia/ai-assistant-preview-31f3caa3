/**
 * SQS queue adapter — fire-and-forget producer used by the API to enqueue
 * ingestion jobs. The worker consumes via sqs-consumer.ts.
 */
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export interface SqsQueueOptions {
  region: string;
  queueUrl: string;
}

export class SqsQueueProvider<T = unknown> {
  private readonly client: SQSClient;
  constructor(private readonly opts: SqsQueueOptions) {
    this.client = new SQSClient({ region: opts.region });
  }

  async enqueue(name: string, payload: T): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.opts.queueUrl,
        MessageBody: JSON.stringify({ name, payload, ts: new Date().toISOString() }),
      })
    );
  }
}
