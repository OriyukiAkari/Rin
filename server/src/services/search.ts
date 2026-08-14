import { and, desc, eq, like, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feeds } from "../db/schema";
import { stripMarkdown } from "../utils/markdown";

export function SearchService(): Hono<{
  Bindings: Env;
  Variables: Variables;
}> {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.get("/:keyword", async (c) => {
    const db = c.get("db");
    const cache = c.get("cache");
    const admin = c.get("admin");
    const page = c.req.query("page");
    const limit = c.req.query("limit");
    const keyword = decodeURI(c.req.param("keyword"));
    const pageNumber = (page && parseInt(page) > 0 ? parseInt(page) : 1) - 1;
    const limitNumber = limit ? Math.min(parseInt(limit), 50) : 20;

    if (!keyword.trim()) {
      return c.json({ size: 0, data: [], hasNext: false });
    }

    const cacheKey = `search_${admin ? "admin" : "public"}_${keyword}`;
    const searchKeyword = `%${keyword}%`;
    const whereClause = or(
      like(feeds.title, searchKeyword),
      like(feeds.content, searchKeyword),
      like(feeds.summary, searchKeyword),
      like(feeds.alias, searchKeyword),
    );

    const rows = await profileAsync(c, "feed_search_cache_db", () =>
      cache.getOrSet(cacheKey, () =>
        db.query.feeds.findMany({
          where: admin ? whereClause : and(whereClause, eq(feeds.draft, 0), eq(feeds.listed, 1)),
          columns: admin ? undefined : { draft: false, listed: false },
          with: {
            hashtags: {
              columns: {},
              with: { hashtag: { columns: { id: true, name: true } } },
            },
            user: { columns: { id: true, username: true, avatar: true } },
          },
          orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
        }),
      ),
    );

    const feedList = rows.map(({ content, hashtags, summary, ...other }) => {
      const plainText = stripMarkdown(content);
      return {
        summary: summary.length > 0 ? summary : plainText.slice(0, 100),
        hashtags: hashtags.map(({ hashtag }) => hashtag),
        ...other,
      };
    });

    const start = pageNumber * limitNumber;
    const data = feedList.slice(start, start + limitNumber);
    return c.json({
      size: feedList.length,
      data,
      hasNext: start + data.length < feedList.length,
    });
  });

  return app;
}
