// Browser polyfill for Node's `global`. Must be imported BEFORE
// amazon-cognito-identity-js (which transitively requires `buffer`).
if (typeof globalThis !== "undefined" && typeof (globalThis as { global?: unknown }).global === "undefined") {
  (globalThis as { global: unknown }).global = globalThis;
}
export {};
