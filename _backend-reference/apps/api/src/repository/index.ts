/**
 * Repository factory — selects between the in-memory AppRepository (default,
 * used when DATABASE_URL is unset) and the Prisma-backed repository.
 *
 * The Prisma path keeps the in-memory `state` shape so existing call sites
 * keep working: the in-memory cache is hydrated from Postgres on boot, and
 * writes are mirrored back via Prisma. This is a pragmatic seam; pure
 * Prisma queries can be migrated case-by-case in `prisma-repo.ts`.
 */
import { AppRepository } from "../state.js";
import { PrismaAppRepository } from "./prisma-repo.js";

export async function createRepository(): Promise<AppRepository> {
  if (!process.env.DATABASE_URL) {
    const repo = new AppRepository();
    await repo.ready();
    return repo;
  }
  const repo = new PrismaAppRepository();
  await repo.ready();
  return repo;
}

export type { AppRepository };
