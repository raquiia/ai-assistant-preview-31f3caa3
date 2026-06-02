/**
 * Textract async adapter for scanned PDFs / images.
 *
 * Flow:
 *   1. startJob({ bucket, key }) → returns jobId, completion notified via SNS
 *   2. SNS → SQS callback queue → worker handler invokes fetchResult(jobId)
 *   3. fetchResult paginates GetDocumentTextDetection and returns full text
 */
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";

export interface TextractOptions {
  region: string;
  snsTopicArn?: string;
  snsRoleArn?: string;
}

export interface TextractJob {
  jobId: string;
}

export class TextractProvider {
  private readonly client: TextractClient;
  constructor(private readonly opts: TextractOptions) {
    this.client = new TextractClient({ region: opts.region });
  }

  async startJob(bucket: string, key: string, clientToken?: string): Promise<TextractJob> {
    const res = await this.client.send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
        ClientRequestToken: clientToken,
        NotificationChannel:
          this.opts.snsTopicArn && this.opts.snsRoleArn
            ? { SNSTopicArn: this.opts.snsTopicArn, RoleArn: this.opts.snsRoleArn }
            : undefined,
      })
    );
    if (!res.JobId) throw new Error("Textract did not return a JobId");
    return { jobId: res.JobId };
  }

  async fetchResult(jobId: string): Promise<{ status: string; text: string }> {
    let nextToken: string | undefined;
    const lines: string[] = [];
    let status = "IN_PROGRESS";
    do {
      const res = await this.client.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken })
      );
      status = res.JobStatus ?? "IN_PROGRESS";
      for (const block of res.Blocks ?? []) {
        if (block.BlockType === "LINE" && block.Text) lines.push(block.Text);
      }
      nextToken = res.NextToken;
    } while (nextToken);
    return { status, text: lines.join("\n") };
  }
}
