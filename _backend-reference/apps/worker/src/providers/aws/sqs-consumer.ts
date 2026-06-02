/**
 * SQS consumer for the ingestion worker. Long-polls the queue, executes the
 * existing ingestion pipeline, deletes the message on success. Failures fall
 * through to the DLQ via SQS redrive policy (no manual retry logic needed).
 */
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";

export interface SqsConsumerOptions {
  region: string;
  queueUrl: string;
  visibilityTimeoutSeconds?: number;
  waitTimeSeconds?: number;
  maxConcurrent?: number;
}

export type JobHandler = (name: string, payload: unknown) => Promise<void>;

export class SqsConsumer {
  private readonly client: SQSClient;
  private stopped = false;

  constructor(private readonly opts: SqsConsumerOptions) {
    this.client = new SQSClient({ region: opts.region });
  }

  async run(handler: JobHandler): Promise<void> {
    const wait = this.opts.waitTimeSeconds ?? 20;
    const maxBatch = Math.min(this.opts.maxConcurrent ?? 5, 10);

    while (!this.stopped) {
      try {
        const res = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: this.opts.queueUrl,
            MaxNumberOfMessages: maxBatch,
            WaitTimeSeconds: wait,
            VisibilityTimeout: this.opts.visibilityTimeoutSeconds ?? 900,
          })
        );
        const messages = res.Messages ?? [];
        if (messages.length === 0) continue;

        await Promise.allSettled(
          messages.map(async (msg) => {
            if (!msg.Body || !msg.ReceiptHandle) return;
            try {
              const parsed = JSON.parse(msg.Body) as { name: string; payload: unknown };
              await handler(parsed.name, parsed.payload);
              await this.client.send(
                new DeleteMessageCommand({ QueueUrl: this.opts.queueUrl, ReceiptHandle: msg.ReceiptHandle })
              );
            } catch (err) {
              console.error("[sqs-consumer] job failed:", err);
              // Reset visibility so the message becomes available faster for
              // retry (DLQ kicks in after maxReceiveCount).
              await this.client
                .send(
                  new ChangeMessageVisibilityCommand({
                    QueueUrl: this.opts.queueUrl,
                    ReceiptHandle: msg.ReceiptHandle,
                    VisibilityTimeout: 30,
                  })
                )
                .catch(() => undefined);
            }
          })
        );
      } catch (err) {
        console.error("[sqs-consumer] poll failed:", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
