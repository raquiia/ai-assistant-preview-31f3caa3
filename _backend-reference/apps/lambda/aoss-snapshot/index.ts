/**
 * AOSS snapshot Lambda — runs daily (EventBridge cron) and triggers a
 * snapshot of every index in the `mp` collection to the DR S3 bucket.
 *
 * AOSS doesn't ship a native snapshot scheduler, so we call the OpenSearch
 * `_snapshot/<repo>/<name>` REST API with SigV4. The repo is registered once
 * (idempotent) pointing to the DR bucket with a dedicated IAM role.
 */
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { HttpRequest } from "@aws-sdk/protocol-http";

const ENDPOINT = process.env.AOSS_ENDPOINT!;
const BUCKET = process.env.SNAPSHOT_BUCKET!;
const ROLE_ARN = process.env.SNAPSHOT_ROLE!;
const REGION = process.env.AWS_REGION!;
const REPO_NAME = "mp-dr";

const signer = new SignatureV4({
  service: "aoss",
  region: REGION,
  credentials: defaultProvider(),
  sha256: Sha256,
});

async function aossFetch(path: string, method: "GET" | "PUT" | "POST", body?: unknown): Promise<unknown> {
  const url = new URL(ENDPOINT + path);
  const req = new HttpRequest({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method,
    headers: { host: url.hostname, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const signed = await signer.sign(req);
  const res = await fetch(url, {
    method,
    headers: signed.headers as HeadersInit,
    body: signed.body as BodyInit | undefined,
  });
  if (!res.ok) throw new Error(`AOSS ${method} ${path} failed: ${res.status} ${await res.text()}`);
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("json") ? res.json() : res.text();
}

async function ensureRepo(): Promise<void> {
  await aossFetch(`/_snapshot/${REPO_NAME}`, "PUT", {
    type: "s3",
    settings: { bucket: BUCKET, region: REGION, role_arn: ROLE_ARN, base_path: "aoss-snapshots" },
  });
}

export const handler = async (): Promise<{ snapshot: string }> => {
  await ensureRepo();
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const name = `mp-${ymd}`;
  await aossFetch(`/_snapshot/${REPO_NAME}/${name}?wait_for_completion=false`, "PUT", {
    indices: "mp-*",
    ignore_unavailable: true,
    include_global_state: false,
  });
  console.log("[aoss-snapshot] started", name);
  return { snapshot: name };
};
