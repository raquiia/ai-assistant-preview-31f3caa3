/**
 * Cognito admin adapter — dual-write user lifecycle (SuperAdmin → Cognito + DB).
 *
 * All operations are scoped to a single User Pool ARN passed at construction.
 * IAM permissions required (resource-scoped to the pool ARN):
 *   cognito-idp:AdminCreateUser, AdminDeleteUser,
 *   AdminAddUserToGroup, AdminRemoveUserFromGroup,
 *   AdminEnableUser, AdminDisableUser,
 *   AdminGetUser, AdminListGroupsForUser
 */
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";
import type { AppRole } from "./cognito-auth.js";

export interface CognitoAdminOptions {
  region: string;
  userPoolId: string;
}

export class CognitoAdminProvider {
  private readonly client: CognitoIdentityProviderClient;

  constructor(private readonly opts: CognitoAdminOptions) {
    this.client = new CognitoIdentityProviderClient({ region: opts.region });
  }

  async createUser(args: {
    email: string;
    name?: string;
    role: AppRole;
    suppressInvite?: boolean;
    temporaryPassword?: string;
  }): Promise<{ sub: string }> {
    const res = await this.client.send(
      new AdminCreateUserCommand({
        UserPoolId: this.opts.userPoolId,
        Username: args.email,
        TemporaryPassword: args.temporaryPassword,
        MessageAction: args.suppressInvite ? MessageActionType.SUPPRESS : undefined,
        UserAttributes: [
          { Name: "email", Value: args.email },
          { Name: "email_verified", Value: "true" },
          ...(args.name ? [{ Name: "name", Value: args.name }] : []),
        ],
      })
    );
    const sub = res.User?.Attributes?.find((a) => a.Name === "sub")?.Value;
    if (!sub) throw new Error("Cognito AdminCreateUser returned no sub");
    await this.addToGroup(args.email, args.role);
    return { sub };
  }

  async deleteUser(username: string): Promise<void> {
    await this.client.send(
      new AdminDeleteUserCommand({ UserPoolId: this.opts.userPoolId, Username: username })
    );
  }

  async addToGroup(username: string, group: AppRole): Promise<void> {
    await this.client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.opts.userPoolId,
        Username: username,
        GroupName: group,
      })
    );
  }

  async removeFromGroup(username: string, group: AppRole): Promise<void> {
    await this.client.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.opts.userPoolId,
        Username: username,
        GroupName: group,
      })
    );
  }

  async setRole(username: string, current: AppRole | null, next: AppRole): Promise<void> {
    if (current && current !== next) await this.removeFromGroup(username, current);
    await this.addToGroup(username, next);
  }

  async enableUser(username: string): Promise<void> {
    await this.client.send(
      new AdminEnableUserCommand({ UserPoolId: this.opts.userPoolId, Username: username })
    );
  }

  async disableUser(username: string): Promise<void> {
    await this.client.send(
      new AdminDisableUserCommand({ UserPoolId: this.opts.userPoolId, Username: username })
    );
  }

  async getUser(username: string) {
    return this.client.send(
      new AdminGetUserCommand({ UserPoolId: this.opts.userPoolId, Username: username })
    );
  }

  async listGroups(username: string): Promise<string[]> {
    const res = await this.client.send(
      new AdminListGroupsForUserCommand({ UserPoolId: this.opts.userPoolId, Username: username })
    );
    return (res.Groups ?? []).map((g) => g.GroupName ?? "").filter(Boolean);
  }
}
