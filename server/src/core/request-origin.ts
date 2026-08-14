import type { Context } from "hono";

function configuredOrigins(env: Env) {
  return new Set(
    (env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function isAllowedRequestOrigin(origin: string, c: Context) {
  if (!origin) return false;
  const requestOrigin = new URL(c.req.url).origin;
  return origin === requestOrigin || configuredOrigins(c.env as Env).has(origin);
}
