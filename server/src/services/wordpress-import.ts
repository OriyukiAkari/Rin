import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feeds } from "../db/schema";
import { syncFeedAISummaryQueueState } from "./feed-ai-summary";
import { normalizeTags } from "./feed-input";
import { bindTagToPost } from "./tag";

type WordPressFeedItem = {
  title: string;
  summary: string;
  content: string;
  draft: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
};

export function WordPressService(): Hono<{
  Bindings: Env;
  Variables: Variables;
}> {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.post("/", async (c) => {
    const db = c.get("db");
    const cache = c.get("cache");
    const serverConfig = c.get("serverConfig");
    const env = c.get("env");
    const admin = c.get("admin");
    const uid = c.get("uid");

    if (!admin) return c.text("Permission denied", 403);
    if (!uid) return c.text("User ID is required", 400);

    const body = await profileAsync(c, "wp_import_parse", () => c.req.parseBody());
    const data = body.data as File;
    if (!data || typeof data.text !== "function" || data.size <= 0 || data.size > 20 * 1024 * 1024) {
      return c.text("Data is required", 400);
    }

    const [{ XMLParser }, htmlToMarkdownModule] = await profileAsync(c, "wp_import_modules", () =>
      Promise.all([import("fast-xml-parser"), import("html-to-md")]),
    );
    const htmlToMarkdown = htmlToMarkdownModule.default;
    const xml = await profileAsync(c, "wp_import_read", () => data.text());

    let parsed: Record<string, unknown>;
    try {
      parsed = await profileAsync(c, "wp_import_xml_parse", () => new XMLParser().parse(xml));
    } catch {
      return c.text("Invalid WordPress export", 400);
    }

    const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
    const rawItems = rss?.channel?.item;
    const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    if (items.length === 0) return c.text("No items found", 404);
    if (items.length > 5000) return c.text("WordPress export contains too many items", 400);

    const feedItems: WordPressFeedItem[] = items.map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      const parsedCreatedAt = new Date(String(item["wp:post_date"] || ""));
      const parsedUpdatedAt = new Date(String(item["wp:post_modified"] || ""));
      const createdAt = Number.isFinite(parsedCreatedAt.getTime()) ? parsedCreatedAt : new Date();
      const updatedAt = Number.isFinite(parsedUpdatedAt.getTime()) ? parsedUpdatedAt : createdAt;
      const encodedContent = item["content:encoded"];
      const content = htmlToMarkdown(typeof encodedContent === "string" ? encodedContent : "");
      const rawTags = Array.isArray(item.category) ? item.category : item.category ? [item.category] : [];
      const tagNames = rawTags.map((tag) => {
        if (tag && typeof tag === "object") {
          return String((tag as Record<string, unknown>)["#text"] || "");
        }
        return String(tag);
      });

      let tags: string[] = [];
      try {
        tags = normalizeTags(tagNames);
      } catch {}

      return {
        title: String(item.title || "Untitled").slice(0, 300),
        summary: content.slice(0, 100),
        content,
        draft: item["wp:status"] !== "publish",
        createdAt,
        updatedAt,
        tags,
      };
    });

    let success = 0;
    let skipped = 0;
    const skippedList: Array<{ title: string; reason: string }> = [];

    for (const item of feedItems) {
      if (!item.content) {
        skippedList.push({ title: item.title, reason: "no content" });
        skipped++;
        continue;
      }

      const existing = await profileAsync(c, "wp_import_existing", () =>
        db.query.feeds.findFirst({ where: eq(feeds.content, item.content) }),
      );
      if (existing) {
        skippedList.push({ title: item.title, reason: "content exists" });
        skipped++;
        continue;
      }

      const inserted = await profileAsync(c, "wp_import_insert", () =>
        db
          .insert(feeds)
          .values({
            title: item.title,
            content: item.content,
            summary: item.summary,
            uid,
            listed: 1,
            draft: item.draft ? 1 : 0,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
          .returning({ insertedId: feeds.id }),
      );
      if (!inserted[0]) {
        skippedList.push({ title: item.title, reason: "insert failed" });
        skipped++;
        continue;
      }

      await profileAsync(c, "wp_import_tags", () => bindTagToPost(db, inserted[0].insertedId, item.tags));
      await profileAsync(c, "wp_import_ai_queue", () =>
        syncFeedAISummaryQueueState(db, serverConfig, env, inserted[0].insertedId, {
          draft: item.draft,
          updatedAt: item.updatedAt,
          resetSummary: true,
        }),
      );
      success++;
    }

    await profileAsync(c, "wp_import_cache_invalidate", () => cache.deletePrefix("feeds_"));
    await profileAsync(c, "wp_import_search_cache_invalidate", () => cache.deletePrefix("search_"));
    return c.json({ success, skipped, skippedList });
  });

  return app;
}
