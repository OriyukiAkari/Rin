import { eq, lt, sql } from "drizzle-orm";
import type { DB } from "../core/hono-types";
import { requestLimits } from "../db/schema";

async function digestIdentifier(value: string, secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${secret}:${value}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function requestClientIdentifier(headers: Headers) {
  return headers.get("cf-connecting-ip") || headers.get("x-real-ip") || "unknown";
}

export async function enforceRateLimit(
  db: DB,
  env: Env,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSeconds / windowSeconds);
  const digest = await digestIdentifier(identifier, env.JWT_SECRET || "rin-rate-limit");
  const key = `${scope}:${bucket}:${digest}`;
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000);

  const result = await db
    .insert(requestLimits)
    .values({ key, requestCount: 1, expiresAt, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: requestLimits.key,
      set: {
        requestCount: sql`${requestLimits.requestCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ requestCount: requestLimits.requestCount });

  return (result[0]?.requestCount ?? limit + 1) <= limit;
}

export async function cleanupRateLimits(db: DB) {
  await db.delete(requestLimits).where(lt(requestLimits.expiresAt, new Date()));
}
