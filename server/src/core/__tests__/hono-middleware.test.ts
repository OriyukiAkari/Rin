import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { cleanupTestDB, createMockDB, createMockEnv } from "../../../tests/fixtures";
import type { JWTUtils, Variables } from "../hono-types";
import { authMiddleware } from "../hono-middleware";

describe("authMiddleware creator boundary", () => {
  let sqlite: Database;
  let db: ReturnType<typeof createMockDB>["db"];
  const env = createMockEnv({ RIN_GITHUB_ADMIN_ID: "456" });

  beforeEach(() => {
    const mock = createMockDB();
    sqlite = mock.sqlite;
    db = mock.db;
    sqlite.exec(`
      INSERT INTO users (id, username, avatar, permission, openid) VALUES
        (1, 'creator', '', 1, '456'),
        (2, 'other-admin', '', 1, '789')
    `);
  });

  afterEach(() => cleanupTestDB(sqlite));

  function createApp() {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.use(createMiddleware(async (c, next) => {
      c.set("db", db as any);
      c.set("jwt", {
        sign: async () => "unused",
        verify: async (token?: string) => token === "creator" ? { id: 1, v: 0 } : { id: 2, v: 0 },
      } as JWTUtils);
      c.set("admin", false);
      await next();
    }));
    app.use(authMiddleware);
    app.get("/", (c) => c.json({ uid: c.get("uid") ?? null, admin: c.get("admin") }));
    return app;
  }

  it("accepts the configured creator", async () => {
    const res = await createApp().request("/", {
      headers: { Authorization: "Bearer creator" },
    }, env);
    expect(await res.json() as unknown).toEqual({ uid: 1, admin: true });
  });

  it("rejects every other user even if a legacy row has admin permission", async () => {
    const res = await createApp().request("/", {
      headers: { Authorization: "Bearer other" },
    }, env);
    expect(await res.json() as unknown).toEqual({ uid: null, admin: false });
  });
});
