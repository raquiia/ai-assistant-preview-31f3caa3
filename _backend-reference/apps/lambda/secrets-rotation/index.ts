/**
 * AWS Secrets Manager rotation Lambda for AI provider keys (`mp/ai/*`).
 *
 * Implements the 4-step rotation contract:
 *   createSecret → setSecret → testSecret → finishSecret
 *
 * For AI provider keys we cannot auto-generate a new key (the provider's
 * dashboard is the only source of truth), so `createSecret` is a no-op when
 * the AWSPENDING stage already exists — admins call SuperAdmin UI
 * (`PATCH /superadmin/ai-providers/:provider/rotate`) which writes AWSPENDING.
 * This Lambda is then triggered by Secrets Manager to validate + promote.
 *
 * Wire-up: `aws_secretsmanager_secret_rotation` per secret, schedule 30 days.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  UpdateSecretVersionStageCommand,
  DescribeSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import type { SecretsManagerRotationEvent } from "aws-lambda";

const client = new SecretsManagerClient({});

export const handler = async (event: SecretsManagerRotationEvent): Promise<void> => {
  const { SecretId, ClientRequestToken, Step } = event;

  const meta = await client.send(new DescribeSecretCommand({ SecretId }));
  const versions = meta.VersionIdsToStages ?? {};
  if (!versions[ClientRequestToken]) {
    throw new Error(`Rotation token ${ClientRequestToken} not staged for ${SecretId}`);
  }
  if (versions[ClientRequestToken].includes("AWSCURRENT")) {
    console.log("[rotation] already current, nothing to do");
    return;
  }

  switch (Step) {
    case "createSecret":
      // AWSPENDING must already exist (operator-supplied via SuperAdmin UI).
      await client.send(
        new GetSecretValueCommand({ SecretId, VersionId: ClientRequestToken, VersionStage: "AWSPENDING" }),
      );
      return;

    case "setSecret":
      // No external system to update — AI provider keys are read by our API only.
      return;

    case "testSecret": {
      // Smoke test: ensure AWSPENDING parses + contains apiKey.
      const pending = await client.send(
        new GetSecretValueCommand({ SecretId, VersionId: ClientRequestToken, VersionStage: "AWSPENDING" }),
      );
      const parsed = JSON.parse(pending.SecretString ?? "{}") as { apiKey?: string };
      if (!parsed.apiKey || parsed.apiKey.length < 8) throw new Error("Pending secret missing apiKey");
      return;
    }

    case "finishSecret": {
      const currentVersionId = Object.entries(versions).find(([, s]) => s.includes("AWSCURRENT"))?.[0];
      await client.send(
        new UpdateSecretVersionStageCommand({
          SecretId,
          VersionStage: "AWSCURRENT",
          MoveToVersionId: ClientRequestToken,
          RemoveFromVersionId: currentVersionId,
        }),
      );
      return;
    }

    default:
      throw new Error(`Unknown rotation step: ${Step as string}`);
  }
};
