export function parseFeedId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

const RESERVED_ALIASES = new Set([
  "admin",
  "api",
  "atom.xml",
  "callback",
  "feed",
  "feed.xml",
  "friends",
  "hashtag",
  "hashtags",
  "login",
  "moments",
  "profile",
  "rss.json",
  "rss.xml",
  "search",
  "timeline",
  "user",
]);

export function normalizeFeedAlias(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid alias");

  const alias = value.trim();
  if (
    alias.length > 120 ||
    !/^[\p{L}\p{N}_-]+$/u.test(alias) ||
    RESERVED_ALIASES.has(alias.toLowerCase())
  ) {
    throw new Error("Invalid alias");
  }
  return alias;
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Invalid tags");

  const tags = value.map((tag) => (typeof tag === "string" ? tag.trim() : ""));
  if (tags.some((tag) => !tag || tag.length > 50)) throw new Error("Invalid tags");
  return [...new Set(tags)];
}

export function parseRequestedDate(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Invalid date");

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
  return date;
}
