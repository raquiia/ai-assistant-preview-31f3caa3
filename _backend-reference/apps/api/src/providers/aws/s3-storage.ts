/**
 * S3 storage adapter — implements StorageProvider with presigned URLs for
 * direct browser uploads/downloads. Used when S3_KNOWLEDGE_BUCKET is set.
 */
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

export interface S3StorageOptions {
  region: string;
  bucket: string;
  kmsKeyId?: string;
}

export class S3StorageProvider {
  private readonly client: S3Client;
  constructor(private readonly opts: S3StorageOptions) {
    this.client = new S3Client({ region: opts.region });
  }

  async putObject(key: string, data: Buffer, contentType: string): Promise<{ uri: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: this.opts.kmsKeyId ? "aws:kms" : "AES256",
        SSEKMSKeyId: this.opts.kmsKeyId,
      })
    );
    return { uri: `s3://${this.opts.bucket}/${key}` };
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch {
      return null;
    }
  }

  async presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: this.opts.kmsKeyId ? "aws:kms" : "AES256",
        SSEKMSKeyId: this.opts.kmsKeyId,
      }),
      { expiresIn }
    );
  }

  async presignGet(key: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }),
      { expiresIn }
    );
  }
}
