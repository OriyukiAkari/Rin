import type { Context } from "hono";
import { wrapTime } from "hono/timing";

export async function profileAsync<T>(
  c: Context,
  name: string,
  task: () => Promise<T> | T,
): Promise<T> {
  if (!c.get("metric")) return await task();
  return wrapTime(c, name, Promise.resolve(task()));
}
