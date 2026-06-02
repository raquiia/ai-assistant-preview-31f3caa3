import bcrypt from "bcryptjs";

let consultantHash: Promise<string> | null = null;
let adminHash: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function verifyDemoPassword(password: string): Promise<boolean> {
  consultantHash ??= hashPassword("password123");
  adminHash ??= hashPassword("admin123");
  return verifyPassword(password, await consultantHash) || verifyPassword(password, await adminHash);
}
