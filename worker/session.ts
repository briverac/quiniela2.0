import type { Db } from "./db/drizzle";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "quiniela_session";
const SESSION_DAYS = 30;

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function sessionCookieOpts(maxAgeSec: number, secure: boolean): string {
  const s = secure ? "Secure; " : "";
  return `Path=/; HttpOnly; ${s}SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export async function createSession(db: Db, userId: number): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000).toISOString();
  await db.insert(schema.sessions).values({
    id,
    userId,
    expiresAt: expires,
    createdAt: now.toISOString(),
  });
  return id;
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function getUserFromSessionCookie(
  db: Db,
  cookieHeader: string | null | undefined
): Promise<(typeof schema.users.$inferSelect) | null> {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  const sid = decodeURIComponent(m[1]!.trim());
  if (!sid) return null;
  const now = new Date().toISOString();
  const srows = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sid))
    .limit(1);
  const s = srows[0];
  if (!s || s.expiresAt <= now) {
    if (s) await deleteSession(db, sid);
    return null;
  }
  const urows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, s.userId))
    .limit(1);
  return urows[0] ?? null;
}

export function clearSessionCookie(secure: boolean): string {
  const s = secure ? "Secure; " : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${s}SameSite=Lax; Max-Age=0`;
}

export function setSessionCookie(sessionId: string, secure: boolean): string {
  const maxAge = SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${sessionCookieOpts(maxAge, secure)}`;
}
