import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { cleanupTestDB, setupTestApp } from "../../../tests/fixtures";
import { SearchService } from "../search";

describe("SearchService visibility and cache isolation", () => {
  let sqlite: Database;
  let env: Env;
  let app: Hono<{ Bindings: Env; Variables: Variables }>;

  beforeEach(async () => {
    const context = await setupTestApp(SearchService);
    sqlite = context.sqlite;
    env = context.env;
    app = context.app;
    await context.clientConfig.set("cache.enabled", true);
    sqlite.exec(`
      INSERT INTO users (id, username, openid, permission) VALUES (1, 'admin', 'admin', 1);
      INSERT INTO feeds (id, title, content, uid, draft, listed) VALUES
        (1, 'Visible term', 'term public', 1, 0, 1),
        (2, 'Draft term', 'term secret draft', 1, 1, 1),
        (3, 'Unlisted term', 'term secret unlisted', 1, 0, 0);
    `);
  });

  afterEach(() => cleanupTestDB(sqlite));

  it("does not reuse an administrator result for a public search", async () => {
    const adminResponse = await app.request("/term", {
      headers: { Authorization: "Bearer mock_token_1" },
    }, env);
    expect((await adminResponse.json() as { size: number }).size).toBe(3);

    const publicResponse = await app.request("/term", {}, env);
    const result = await publicResponse.json() as { size: number; data: Array<{ title: string }> };
    expect(result.size).toBe(1);
    expect(result.data.map((feed) => feed.title)).toEqual(["Visible term"]);
  });
});
