import "./globalPolyfill";
import { CognitoAuthProvider } from "./cognitoProvider";
import { LocalAuthProvider } from "./localProvider";
import { AUTH_MODE, type AuthProvider } from "./providers";

function buildProvider(): AuthProvider {
  if (AUTH_MODE === "cognito") {
    const region = import.meta.env.VITE_COGNITO_REGION as string | undefined;
    const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
    if (!region || !userPoolId || !clientId) {
      throw new Error(
        "VITE_AUTH_MODE=cognito requires VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.",
      );
    }
    return new CognitoAuthProvider({ region, userPoolId, clientId });
  }
  return new LocalAuthProvider();
}

export const authProvider: AuthProvider = buildProvider();
export { AUTH_MODE } from "./providers";
export type { AuthProvider } from "./providers";
