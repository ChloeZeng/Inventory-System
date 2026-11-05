// Per-user view settings (columns, filters). A UI preference, so not audited.
import { prisma } from "./prisma";

// Allowed keys, e.g. "inventory:item:all", "inventory:lot:12", "item:lots".
export const PREFERENCE_KEY = /^[a-z]+(:[a-z0-9]+){0,3}$/;

export async function getPreference<T>(userId: number, key: string): Promise<T | null> {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key } } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}
