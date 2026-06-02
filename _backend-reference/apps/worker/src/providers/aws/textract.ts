/**
 * Textract async adapter for scanned PDFs / images.
 *
 * Flow:
 *   1. startJob({ bucket, key }) → returns jobId, completion notified via SNS
 *   2. SNS → SQS callback queue → worker handler invokes fetchResult(jobId)
 *   3. fetchResult paginates GetDocumentTextDetection and returns full text
 *      plus the average OCR confidence so the pipeline can decide whether
 *      to auto-publish or flag NEEDS_REVIEW.
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

export interface TextractResult {
  /** SUCCEEDED | PARTIAL_SUCCESS | FAILED | IN_PROGRESS */
  status: string;
  text: string;
  /** 0..1 — average confidence across LINE blocks; 0 if no lines. */
  confidence: number;
  /** Number of LINE blocks aggregated. */
  lines: number;
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
        // JobTag is carried back in the SNS notification so the worker can
        // correlate the result with our documentId without an extra DB lookup.
        JobTag: clientToken,
        NotificationChannel:
          this.opts.snsTopicArn && this.opts.snsRoleArn
            ? { SNSTopicArn: this.opts.snsTopicArn, RoleArn: this.opts.snsRoleArn }
            : undefined,
      })
    );
    if (!res.JobId) throw new Error("Textract did not return a JobId");
    return { jobId: res.JobId };
  }

  async fetchResult(jobId: string): Promise<TextractResult> {
    let nextToken: string | undefined;
    const lines: string[] = [];
    let confidenceSum = 0;
    let lineCount = 0;
    let status = "IN_PROGRESS";
    do {
      const res = await this.client.send(
        new GetDocumentTextDetectionCommand({ JobId: jobId, NextToken: nextToken })
      );
      status = res.JobStatus ?? "IN_PROGRESS";
      for (const block of res.Blocks ?? []) {
        if (block.BlockType === "LINE" && block.Text) {
          lines.push(block.Text);
          if (typeof block.Confidence === "number") {
            confidenceSum += block.Confidence;
            lineCount += 1;
          }
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
    const confidence = lineCount ? confidenceSum / lineCount / 100 : 0;
    return { status, text: lines.join("\n"), confidence, lines: lineCount };
  }
}
