import { Hono } from "hono";
import type { AppContext, Variables } from "../core/hono-types";

export function AuthService(): Hono<{
  Bindings: Env;
  Variables: Variables;
}> {
  const app = new Hono<{
    Bindings: Env;
    Variables: Variables;
  }>();

  // Kept as an explicit denial for older clients. Password authentication is
  // intentionally not part of the v1.2 security model.
  app.post("/login", (c) => {
    return c.json({
      success: false,
      error: { code: "FORBIDDEN", message: "Password login is disabled" },
    }, 403);
  });

  app.get("/status", (c: AppContext) => {
    const env = c.env;
    return c.json({
      github: Boolean(
        env.RIN_GITHUB_CLIENT_ID &&
        env.RIN_GITHUB_CLIENT_SECRET &&
        env.RIN_GITHUB_ADMIN_ID,
      ),
      password: false,
    });
  });

  return app;
}
