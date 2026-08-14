import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { CacheImpl } from "../utils/cache";

export function createRuntimeServices(env: Env) {
  const db = drizzle(env.DB, { schema });
  const clientConfig = new CacheImpl(db, env, "client.config");
  const serverConfig = new CacheImpl(db, env, "server.config", "database");
  const cache = new CacheImpl(db, env, "cache", undefined, clientConfig);

  return {
    db,
    cache,
    clientConfig,
    serverConfig,
  };
}
