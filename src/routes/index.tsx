import { createFileRoute } from "@tanstack/react-router";
import { MpApp } from "../mp/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MIGSO-PCUBED — AI Assistant" },
      { name: "description", content: "Assistant IA interne MIGSO-PCUBED (preview front uniquement, backend AWS séparé)." },
      { property: "og:title", content: "MIGSO-PCUBED — AI Assistant" },
      { property: "og:description", content: "Preview front porté depuis mp-ai-assistant, mode mocks par défaut." },
    ],
  }),
  component: MpApp,
});
