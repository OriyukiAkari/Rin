import { and, asc, count, desc, eq, gt, lt, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feeds, visitStats } from "../db/schema";
import { HyperLogLog } from "../utils/hyperloglog";
import { extractImageWithMetadata } from "../utils/image";
import { stripMarkdown } from "../utils/markdown";
import { parsePagination } from "../utils/pagination";
import { syncFeedAISummaryQueueState } from "./feed-ai-summary";
import { normalizeFeedAlias, normalizeTags, parseFeedId, parseRequestedDate } from "./feed-input";
import { bindTagToPost } from "./tag";
import { clearFeedCache } from "./clear-feed-cache";
import { feedCreateSchema, feedSetTopSchema, feedUpdateSchema, validateSchema } from "@rin/api";

export function FeedService(): Hono<{
    Bindings: Env;
    Variables: Variables;
}> {
    const app = new Hono<{
        Bindings: Env;
        Variables: Variables;
    }>();

    // GET /feed - List feeds
    app.get('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const page = c.req.query('page');
        const limit = c.req.query('limit');
        const type = c.req.query('type');

        if ((type === 'draft' || type === 'unlisted') && !admin) {
            return c.text('Permission denied', 403);
        }

        const { pageIndex: page_num, limit: limit_num } = parsePagination(page, limit);
        const cacheKey = `feeds_${type}_${page_num}_${limit_num}`;
        const cached = await profileAsync(c, 'feed_list_cache_get', () => cache.get(cacheKey));

        if (cached) {
            return c.json(cached);
        }

        const where = type === 'draft'
            ? eq(feeds.draft, 1)
            : type === 'unlisted'
                ? and(eq(feeds.draft, 0), eq(feeds.listed, 0))
                : and(eq(feeds.draft, 0), eq(feeds.listed, 1));

        const size = await profileAsync(c, 'feed_list_count', () => db.select({ count: count() }).from(feeds).where(where));

        if (size[0].count === 0) {
            return c.json({ size: 0, data: [], hasNext: false });
        }

        const feed_list = (await profileAsync(c, 'feed_list_db', () => db.query.feeds.findMany({
            where: where,
            columns: admin ? undefined : { draft: false, listed: false },
            with: {
                hashtags: {
                    columns: {},
                    with: {
                        hashtag: { columns: { id: true, name: true } }
                    }
                },
                user: { columns: { id: true, username: true, avatar: true } }
            },
            orderBy: [desc(feeds.top), desc(feeds.createdAt), desc(feeds.updatedAt)],
            offset: page_num * limit_num,
            limit: limit_num + 1,
        }))).map(({ content, hashtags, summary, ...other }: any) => {
            const avatar = extractImageWithMetadata(content);
            const plainText = stripMarkdown(content);
            return {
                summary: summary.length > 0 ? summary : plainText.length > 100 ? plainText.slice(0, 100) : plainText,
                hashtags: hashtags.map(({ hashtag }: any) => hashtag),
                avatar,
                ...other
            };
        });

        let hasNext = false;
        if (feed_list.length === limit_num + 1) {
            feed_list.pop();
            hasNext = true;
        }

        const data = { size: size[0].count, data: feed_list, hasNext };

        if (type === undefined || type === 'normal' || type === '') {
            await profileAsync(c, 'feed_list_cache_set', () => cache.set(cacheKey, data));
        }

        return c.json(data);
    });

    // GET /feed/timeline
    app.get('/timeline', async (c) => {
        const db = c.get('db');
        const where = and(eq(feeds.draft, 0), eq(feeds.listed, 1));

        return c.json(await profileAsync(c, 'feed_timeline_db', () => db.query.feeds.findMany({
            where: where,
            columns: { id: true, title: true, createdAt: true },
            orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
            limit: 1000,
        })));
    });

    // POST /feed - Create feed
    app.post('/', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');

        if (!admin) {
            return c.text('Permission denied', 403);
        }

        const body = await profileAsync(c, 'feed_create_parse', () => c.req.json());
        const validation = validateSchema(feedCreateSchema, body);
        if (!validation.success) return c.text(validation.errors[0], 400);
        const { title, alias, listed, content, summary, draft, tags, createdAt } = body;

        if (typeof title !== 'string' || !title.trim() || title.length > 300) {
            return c.text('Title is required', 400);
        }
        if (typeof content !== 'string' || !content.trim() || content.length > 2_000_000) {
            return c.text('Content is required', 400);
        }
        if (summary !== undefined && (typeof summary !== 'string' || summary.length > 10_000)) {
            return c.text('Invalid summary', 400);
        }
        if (typeof listed !== 'boolean' || typeof draft !== 'boolean') {
            return c.text('Invalid publication state', 400);
        }

        let normalizedAlias: string | null;
        let normalizedTags: string[];
        let date: Date;
        try {
            normalizedAlias = normalizeFeedAlias(alias);
            normalizedTags = normalizeTags(tags);
            date = parseRequestedDate(createdAt) || new Date();
        } catch (error) {
            return c.text(error instanceof Error ? error.message : 'Invalid input', 400);
        }

        if (normalizedAlias) {
            const aliasExists = await db.query.feeds.findFirst({ where: eq(feeds.alias, normalizedAlias) });
            if (aliasExists) return c.text('Alias already exists', 409);
        }

        const exist = await profileAsync(c, 'feed_create_existing', () => db.query.feeds.findFirst({
            where: or(eq(feeds.title, title), eq(feeds.content, content))
        }));

        if (exist) {
            return c.text('Content already exists', 400);
        }

        if (!uid) {
            return c.text('User ID is required', 400);
        }

        const result = await profileAsync(c, 'feed_create_insert', () => db.insert(feeds).values({
            title,
            content,
            summary,
            ai_summary: "",
            ai_summary_status: "idle",
            ai_summary_error: "",
            uid,
            alias: normalizedAlias,
            listed: listed ? 1 : 0,
            draft: draft ? 1 : 0,
            createdAt: date,
            updatedAt: date
        }).returning({ insertedId: feeds.id }));

        if (result.length === 0) {
            return c.text('Failed to insert', 500);
        }

        await profileAsync(c, 'feed_create_tags', () => bindTagToPost(db, result[0].insertedId, normalizedTags));
        await profileAsync(c, 'feed_create_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, result[0].insertedId, {
            draft: Boolean(draft),
            updatedAt: date,
            resetSummary: true,
        }));
        await profileAsync(c, 'feed_create_cache_invalidate', () => cache.deletePrefix('feeds_'));

        return c.json(result[0]);
    });

    // GET /feed/:id
    app.get('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const clientConfig = c.get('clientConfig');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');
        const id_num = parseFeedId(id);
        const cacheKey = id_num === null ? `feed_alias_${id}` : `feed_id_${id_num}`;
        const where = id_num === null ? eq(feeds.alias, id) : eq(feeds.id, id_num);

        const loadFeed = (includeDrafts: boolean) => db.query.feeds.findFirst({
            where: includeDrafts ? where : and(where, eq(feeds.draft, 0)),
            with: {
                hashtags: {
                    columns: {},
                    with: {
                        hashtag: { columns: { id: true, name: true } }
                    }
                },
                user: { columns: { id: true, username: true, avatar: true } }
            }
        });
        const feed = await profileAsync(c, 'feed_detail_cache_db', () =>
            admin && uid
                ? loadFeed(true)
                : cache.getOrSet(cacheKey, () => loadFeed(false)),
        );

        if (!feed) {
            return c.text('Not found', 404);
        }

        const { hashtags, ...other } = feed;
        const hashtags_flatten = hashtags.map((f: any) => f.hashtag);

        // update visits using HyperLogLog for efficient UV estimation
        const enableVisit = await profileAsync(c, 'feed_detail_counter_flag', () => clientConfig.getOrDefault('counter.enabled', true));
        let pv = 0;
        let uv = 0;

        if (enableVisit) {
            const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || "UNK";
            const visitorKey = `${ip}`;

            // Get or create visit stats for this feed
            let stats = await profileAsync(c, 'feed_detail_stats_lookup', () => db.query.visitStats.findFirst({
                where: eq(visitStats.feedId, feed.id)
            }));

            if (!stats) {
                // Create new stats record
                const hll = new HyperLogLog();
                hll.add(visitorKey);
                await profileAsync(c, 'feed_detail_stats_insert', () => db.insert(visitStats).values({
                    feedId: feed.id,
                    pv: 1,
                    hllData: hll.serialize()
                }));
                pv = 1;
                uv = Math.round(hll.count());
            } else {
                // Update existing stats
                const hll = new HyperLogLog(stats.hllData);
                hll.add(visitorKey);
                const newHllData = hll.serialize();
                const newPv = stats.pv + 1;

                await profileAsync(c, 'feed_detail_stats_update', () => db.update(visitStats)
                    .set({
                        pv: newPv,
                        hllData: newHllData,
                        updatedAt: new Date()
                    })
                    .where(eq(visitStats.feedId, feed.id)));

                pv = newPv;
                uv = Math.round(hll.count());
            }
        }

        return c.json({ ...other, hashtags: hashtags_flatten, pv, uv });
    });

    // GET /feed/adjacent/:id
    app.get("/adjacent/:id", async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const id = c.req.param('id');
        let id_num = parseFeedId(id);

        if (id_num === null) {
            const aliasRecord = await profileAsync(c, 'feed_adjacent_alias_lookup', () => db.select({ id: feeds.id }).from(feeds).where(eq(feeds.alias, id)));
            if (aliasRecord.length === 0) {
                return c.text("Not found", 404);
            }
            id_num = aliasRecord[0].id;
        }

        const feed = await profileAsync(c, 'feed_adjacent_current', () => db.query.feeds.findFirst({
            where: eq(feeds.id, id_num),
            columns: { createdAt: true },
        }));

        if (!feed) {
            return c.text("Not found", 404);
        }

        const created_at = feed.createdAt;

        function formatAndCacheData(feed: any, feedDirection: "previous_feed" | "next_feed") {
            if (feed) {
                const hashtags_flatten = feed.hashtags.map((f: any) => f.hashtag);
                const plainText = stripMarkdown(feed.content);
                const summary = feed.summary.length > 0
                    ? feed.summary
                    : plainText.length > 50 ? plainText.slice(0, 50) : plainText;
                const cacheKey = `${feed.id}_${feedDirection}_${id_num}`;
                const cacheData = {
                    id: feed.id,
                    title: feed.title,
                    summary: summary,
                    hashtags: hashtags_flatten,
                    createdAt: feed.createdAt,
                    updatedAt: feed.updatedAt,
                };
                cache.set(cacheKey, cacheData);
                return cacheData;
            }
            return null;
        }

        const getPreviousFeed = async () => {
            const previousFeedCached = await profileAsync(c, 'feed_adjacent_prev_cache', () => cache.getBySuffix(`previous_feed_${id_num}`));
            if (previousFeedCached && previousFeedCached.length > 0) {
                return previousFeedCached[0];
            } else {
                const tempPreviousFeed = await profileAsync(c, 'feed_adjacent_prev_db', () => db.query.feeds.findFirst({
                    where: and(and(eq(feeds.draft, 0), eq(feeds.listed, 1)), lt(feeds.createdAt, created_at)),
                    orderBy: [desc(feeds.createdAt)],
                    with: {
                        hashtags: {
                            columns: {},
                            with: { hashtag: { columns: { id: true, name: true } } }
                        },
                        user: { columns: { id: true, username: true, avatar: true } }
                    },
                }));
                return formatAndCacheData(tempPreviousFeed, "previous_feed");
            }
        };

        const getNextFeed = async () => {
            const nextFeedCached = await profileAsync(c, 'feed_adjacent_next_cache', () => cache.getBySuffix(`next_feed_${id_num}`));
            if (nextFeedCached && nextFeedCached.length > 0) {
                return nextFeedCached[0];
            } else {
                const tempNextFeed = await profileAsync(c, 'feed_adjacent_next_db', () => db.query.feeds.findFirst({
                    where: and(and(eq(feeds.draft, 0), eq(feeds.listed, 1)), gt(feeds.createdAt, created_at)),
                    orderBy: [asc(feeds.createdAt)],
                    with: {
                        hashtags: {
                            columns: {},
                            with: { hashtag: { columns: { id: true, name: true } } }
                        },
                        user: { columns: { id: true, username: true, avatar: true } }
                    },
                }));
                return formatAndCacheData(tempNextFeed, "next_feed");
            }
        };

        const [previousFeed, nextFeed] = await Promise.all([getPreviousFeed(), getNextFeed()]);
        return c.json({ previousFeed, nextFeed });
    });

    // POST /feed/:id - Update feed
    app.post('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const serverConfig = c.get('serverConfig');
        const env = c.get('env');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_update_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const body = await profileAsync(c, 'feed_update_parse', () => c.req.json());
        const validation = validateSchema(feedUpdateSchema, body);
        if (!validation.success) return c.text(validation.errors[0], 400);
        const { title, listed, content, summary, alias, draft, top, tags, createdAt } = body;


        if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 300)) {
            return c.text('Invalid title', 400);
        }
        if (content !== undefined && (typeof content !== 'string' || !content.trim() || content.length > 2_000_000)) {
            return c.text('Invalid content', 400);
        }
        if (summary !== undefined && (typeof summary !== 'string' || summary.length > 10_000)) {
            return c.text('Invalid summary', 400);
        }
        if (listed !== undefined && typeof listed !== 'boolean' || draft !== undefined && typeof draft !== 'boolean') {
            return c.text('Invalid publication state', 400);
        }
        if (top !== undefined && top !== 0 && top !== 1) {
            return c.text('Invalid top value', 400);
        }

        let normalizedAlias: string | null | undefined;
        let normalizedTags: string[] | undefined;
        let requestedDate: Date | undefined;
        try {
            normalizedAlias = alias === undefined ? undefined : normalizeFeedAlias(alias);
            normalizedTags = tags === undefined ? undefined : normalizeTags(tags);
            requestedDate = parseRequestedDate(createdAt);
        } catch (error) {
            return c.text(error instanceof Error ? error.message : 'Invalid input', 400);
        }
        if (normalizedAlias) {
            const aliasExists = await db.query.feeds.findFirst({
                where: and(eq(feeds.alias, normalizedAlias), ne(feeds.id, id_num)),
            });
            if (aliasExists) return c.text('Alias already exists', 409);
        }

        const contentChanged = content && content !== feed.content;
        const isDraft = draft !== undefined ? draft : (feed.draft === 1);
        const shouldQueueAISummary = (contentChanged && !isDraft) || (!isDraft && feed.draft === 1 && !feed.ai_summary);
        const updateTime = new Date();

        await profileAsync(c, 'feed_update_db', () => db.update(feeds).set({
            title,
            content,
            summary,
            ai_summary: shouldQueueAISummary ? "" : undefined,
            ai_summary_status: isDraft ? "idle" : undefined,
            ai_summary_error: shouldQueueAISummary || isDraft ? "" : undefined,
            alias: normalizedAlias,
            top: top === undefined ? undefined : Number(top),
            listed: listed === undefined ? undefined : listed ? 1 : 0,
            draft: draft === undefined ? undefined : draft ? 1 : 0,
            createdAt: requestedDate,
            updatedAt: updateTime
        }).where(eq(feeds.id, id_num)));

        if (normalizedTags) {
            await profileAsync(c, 'feed_update_tags', () => bindTagToPost(db, id_num, normalizedTags));
        }

        if (shouldQueueAISummary || isDraft) {
            await profileAsync(c, 'feed_update_ai_queue', () => syncFeedAISummaryQueueState(db, serverConfig, env, id_num, {
                draft: Boolean(isDraft),
                updatedAt: updateTime,
                resetSummary: shouldQueueAISummary,
            }));
        }

        await profileAsync(c, 'feed_update_cache_invalidate', () => clearFeedCache(cache, id_num, feed.alias, normalizedAlias ?? feed.alias));
        return c.text('Updated');
    });

    // POST /feed/top/:id
    app.post('/top/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_top_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        const body = await profileAsync(c, 'feed_top_parse', () => c.req.json());
        const validation = validateSchema(feedSetTopSchema, body);
        if (!validation.success) return c.text(validation.errors[0], 400);
        const { top } = body;

        if (top !== 0 && top !== 1) {
            return c.text('Invalid top value', 400);
        }

        await profileAsync(c, 'feed_top_db', () => db.update(feeds).set({ top }).where(eq(feeds.id, feed.id)));
        await profileAsync(c, 'feed_top_cache_invalidate', () => clearFeedCache(cache, feed.id, feed.alias, feed.alias));
        return c.text('Updated');
    });

    // DELETE /feed/:id
    app.delete('/:id', async (c) => {
        const db = c.get('db');
        const cache = c.get('cache');
        const admin = c.get('admin');
        const uid = c.get('uid');
        const id = c.req.param('id');

        const id_num = parseInt(id);
        const feed = await profileAsync(c, 'feed_delete_lookup', () => db.query.feeds.findFirst({ where: eq(feeds.id, id_num) }));

        if (!feed) {
            return c.text('Not found', 404);
        }

        if (feed.uid !== uid && !admin) {
            return c.text('Permission denied', 403);
        }

        await profileAsync(c, 'feed_delete_db', () => db.delete(feeds).where(eq(feeds.id, id_num)));
        await profileAsync(c, 'feed_delete_cache_invalidate', () => clearFeedCache(cache, id_num, feed.alias, null));
        return c.text('Deleted');
    });
    return app;
}
