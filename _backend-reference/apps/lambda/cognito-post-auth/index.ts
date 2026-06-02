/**
 * Cognito PostAuthentication / PostConfirmation Lambda trigger.
 *
 * Purpose: when a Cognito user logs in, push their current group membership
 * to the API so role changes made in the User Pool are mirrored in the
 * Prisma `User.role` column without waiting for the next `/me` request.
 *
 * Wire-up (Terraform):
 *   - resource "aws_cognito_user_pool" with `lambda_config.post_authentication`
 *     pointing to this function ARN.
 *   - env: API_INTERNAL_URL, WEBHOOK_SECRET (shared with API).
 *
 * The API endpoint `/api/public/webhooks/cognito/sync` validates the HMAC
 * signature before applying the role sync.
 */
import { createHmac } from "node:crypto";
import type {
  PostAuthenticationTriggerEvent,
  PostConfirmationTriggerEvent,
} from "aws-lambda";

type Event = PostAuthenticationTriggerEvent | PostConfirmationTriggerEvent;

export const handler = async (event: Event): Promise<Event> => {
  const apiUrl = process.env.API_INTERNAL_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!apiUrl || !secret) {
    console.warn("[cognito-post-auth] missing API_INTERNAL_URL or WEBHOOK_SECRET, skipping sync");
    return event;
  }

  const attrs = event.request.userAttributes ?? {};
  const groups = (event.request as { groupConfiguration?: { groupsToOverride?: string[] } })
    .groupConfiguration?.groupsToOverride ?? [];

  const body = JSON.stringify({
    sub: attrs.sub,
    email: attrs.email,
    name: attrs.name ?? attrs.email,
    groups,
    triggerSource: event.triggerSource,
    timestamp: Date.now(),
  });

  const signature = createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(`${apiUrl}/api/public/webhooks/cognito/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body,
    });
    if (!res.ok) console.warn("[cognito-post-auth] sync non-2xx", res.status, await res.text());
  } catch (err) {
    // Never block login on sync failure.
    console.error("[cognito-post-auth] sync failed", err);
  }
  return event;
};
