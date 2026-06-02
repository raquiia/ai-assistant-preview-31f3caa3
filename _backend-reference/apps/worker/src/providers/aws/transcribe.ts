/**
 * Transcribe async adapter for audio/video uploads.
 *
 * Flow mirrors Textract:
 *   1. startJob({ bucket, key, languageCode }) → returns jobName
 *   2. Job completion is polled OR signalled by EventBridge rule → SQS callback
 *   3. fetchResult downloads the TranscriptFileUri JSON and returns flat text
 */
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";

export interface TranscribeOptions {
  region: string;
  outputBucket?: string;
}

export interface TranscribeJob {
  jobName: string;
}

export class TranscribeProvider {
  private readonly client: TranscribeClient;
  constructor(private readonly opts: TranscribeOptions) {
    this.client = new TranscribeClient({ region: opts.region });
  }

  async startJob(args: {
    bucket: string;
    key: string;
    jobName: string;
    languageCode?: string;
    mediaFormat?: string;
  }): Promise<TranscribeJob> {
    await this.client.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: args.jobName,
        IdentifyLanguage: !args.languageCode,
        LanguageCode: args.languageCode as never,
        MediaFormat: args.mediaFormat as never,
        Media: { MediaFileUri: `s3://${args.bucket}/${args.key}` },
        OutputBucketName: this.opts.outputBucket,
        OutputKey: `transcripts/${args.jobName}.json`,
      })
    );
    return { jobName: args.jobName };
  }

  async fetchResult(jobName: string): Promise<{ status: string; text: string; uri?: string }> {
    const res = await this.client.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    const job = res.TranscriptionJob;
    const status = job?.TranscriptionJobStatus ?? "IN_PROGRESS";
    const uri = job?.Transcript?.TranscriptFileUri;
    if (status !== "COMPLETED" || !uri) return { status, text: "", uri };
    const r = await fetch(uri);
    const json = (await r.json()) as { results?: { transcripts?: Array<{ transcript?: string }> } };
    const text = json.results?.transcripts?.map((t) => t.transcript ?? "").join("\n") ?? "";
    return { status, text, uri };
  }
}
