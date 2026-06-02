/**
 * Provider bootstrap — selects AWS adapters vs in-memory fallbacks based on env.
 *
 * Environment switches:
 *   DATABASE_URL           → use Prisma repository
 *   S3_KNOWLEDGE_BUCKET    → use S3 storage provider
 *   SQS_INGESTION_URL      → use SQS queue provider
 *   COGNITO_USER_POOL_ID   → use Cognito auth provider
 *   AOSS_ENDPOINT          → use OpenSearch vector provider
 *   SECRETS_PREFIX         → use Secrets Manager for AI provider keys
 *
 * Each is independent — you can start with S3+Cognito only, add AOSS later.
 */
import { S3StorageProvider } from "./providers/aws/s3-storage.js";
import { SqsQueueProvider } from "./providers/aws/sqs-queue.js";
import { SecretsManagerProvider } from "./providers/aws/secrets-manager.js";
import { CognitoAuthProvider } from "./providers/aws/cognito-auth.js";
import { OpenSearchVectorProvider } from "./providers/aws/opensearch-vector.js";

export interface AppProviders {
  storage: S3StorageProvider | null;
  queue: SqsQueueProvider | null;
  secrets: SecretsManagerProvider | null;
  auth: CognitoAuthProvider | null;
  vector: OpenSearchVectorProvider | null;
  mode: "aws" | "memory" | "hybrid";
}

export function bootstrapProviders(): AppProviders {
  const region = process.env.AWS_REGION ?? "eu-west-3";
  const bucket = process.env.S3_KNOWLEDGE_BUCKET;
  const queueUrl = process.env.SQS_INGESTION_URL;
  const poolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const aoss = process.env.AOSS_ENDPOINT;
  const secretsPrefix = process.env.SECRETS_PREFIX;

  const storage = bucket ? new S3StorageProvider({ region, bucket, kmsKeyId: process.env.KMS_KEY_ID }) : null;
  const queue = queueUrl ? new SqsQueueProvider({ region, queueUrl }) : null;
  const secrets = secretsPrefix ? new SecretsManagerProvider(region) : null;
  const auth = poolId && clientId ? new CognitoAuthProvider({ region, userPoolId: poolId, clientId }) : null;
  const vector = aoss ? new OpenSearchVectorProvider({ endpoint: aoss, region }) : null;

  const anyAws = Boolean(storage || queue || secrets || auth || vector);
  const allAws = Boolean(storage && queue && secrets && auth && vector);
  const mode: AppProviders["mode"] = !anyAws ? "memory" : allAws ? "aws" : "hybrid";

  return { storage, queue, secrets, auth, vector, mode };
}
