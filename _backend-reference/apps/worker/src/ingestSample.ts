import { runIngestion } from "./ingestionPipeline.js";

const result = await runIngestion({
  documentId: "sample-local-run",
  title: "Sample local KB upload",
  ownerId: "usr-superadmin",
  objectKey: "sample/local-run.md",
  mimeType: "text/markdown",
  rawText: "Pour le PMO, un reporting KPI fiable doit relier planning, cout, risques et actions. Chaque ecart doit avoir un owner, une cause racine et une date de revue.",
  version: 1
});

console.log(JSON.stringify(result, null, 2));
