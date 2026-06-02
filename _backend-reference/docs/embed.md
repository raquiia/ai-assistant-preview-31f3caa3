# Embed Integration

## Iframe

```html
<iframe
  src="http://localhost:4000/embed/chat?tenant=mp&theme=default"
  title="MIGSO-PCUBED AI Assistant"
  style="width:420px;height:640px;border:0;border-radius:8px"
></iframe>
```

The API checks the `Origin` header against `settings.allowedEmbedOrigins`. Configure it as super admin or with `ALLOWED_EMBED_ORIGINS`.

## Token

```bash
curl -X POST http://localhost:4000/embed/token \
  -H "Origin: http://localhost:5173" \
  -H "Content-Type: application/json" \
  -d '{"subject":"external-app-user-id"}'
```

The returned token is short-lived and intended for future SSO or app-to-app handoff.

## Web Component Contract

Future component:

```html
<mp-ai-chatbot token="SHORT_LIVED_EMBED_TOKEN"></mp-ai-chatbot>
```

## postMessage API

Supported event contract:

```ts
type HostToWidget =
  | { type: "mp-ai-chatbot:open" }
  | { type: "mp-ai-chatbot:close" }
  | { type: "mp-ai-chatbot:prefillPrompt"; prompt: string }
  | { type: "mp-ai-chatbot:sendQuestion"; prompt: string };

type WidgetToHost =
  | { type: "mp-ai-chatbot:ready" }
  | { type: "mp-ai-chatbot:answer"; answer: string; responseId: string }
  | { type: "mp-ai-chatbot:error"; message: string };
```

Validate `event.origin` in both directions before trusting payloads.
