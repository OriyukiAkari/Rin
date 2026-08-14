import { drizzle } from "drizzle-orm/d1";
import { CacheImpl } from "../utils/cache";
import { cleanupRateLimits } from "../utils/rate-limit";
import { lt } from "drizzle-orm";

export async function handleScheduled(
  _controller: ScheduledController | null,
  env: Env,
  ctx: ExecutionContext,
) {
  const schema = await import("../db/schema");
  const db = drizzle(env.DB, { schema });

  const serverConfig = new CacheImpl(db, env, "server.config", "database");
  const clientConfig = new CacheImpl(db, env, "client.config");
  const cache = new CacheImpl(db, env, "cache", undefined, clientConfig);

  const { friendCrontab } = await import("../services/friends");
  const { rssCrontab } = await import("../services/rss");
  const { visits } = await import("../db/schema");

  await friendCrontab(env, ctx, db, cache, serverConfig, clientConfig);
  if (await clientConfig.getOrDefault("rss", false)) {
    await rssCrontab(env, db);
  }
  await cleanupRateLimits(db);
  const configuredRetentionDays = Number.parseInt(env.VISIT_RETENTION_DAYS || "30", 10);
  const visitRetentionDays = Number.isFinite(configuredRetentionDays) ? Math.max(1, configuredRetentionDays) : 30;
  const cutoff = new Date(Date.now() - visitRetentionDays * 24 * 60 * 60 * 1000);
  await db.delete(visits).where(lt(visits.createdAt, cutoff));
}
