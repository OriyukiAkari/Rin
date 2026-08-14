export const FEED_LAYOUT_OPTIONS = ["list", "masonry"] as const;
export const FEED_CARD_VARIANTS = ["default", "editorial"] as const;
export const HEADER_LAYOUT_OPTIONS = ["classic", "compact"] as const;
export const HEADER_BEHAVIOR_OPTIONS = ["fixed", "static", "reveal"] as const;

export type FeedLayout = (typeof FEED_LAYOUT_OPTIONS)[number];
export type FeedCardVariant = (typeof FEED_CARD_VARIANTS)[number];
export type HeaderLayoutOption = (typeof HEADER_LAYOUT_OPTIONS)[number];
export type HeaderBehaviorOption = (typeof HEADER_BEHAVIOR_OPTIONS)[number];

export interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  api_key: string;
  api_url: string;
}

type ConfigDefinition = {
  scope: "client" | "server";
  defaultValue: string | number | boolean;
  env?: string;
  sensitive?: boolean;
  kind?: "string" | "number" | "boolean";
  values?: readonly string[];
};

export const CONFIG_DEFINITIONS = {
  "cache.enabled": { scope: "client", defaultValue: false, kind: "boolean" },
  "counter.enabled": { scope: "client", defaultValue: true, kind: "boolean" },
  friend_apply_enable: { scope: "client", defaultValue: true, kind: "boolean" },
  "header.behavior": {
    scope: "client",
    defaultValue: "fixed",
    kind: "string",
    values: HEADER_BEHAVIOR_OPTIONS,
  },
  "header.layout": {
    scope: "client",
    defaultValue: "classic",
    kind: "string",
    values: HEADER_LAYOUT_OPTIONS,
  },
  "feed.layout": {
    scope: "client",
    defaultValue: "list",
    kind: "string",
    values: FEED_LAYOUT_OPTIONS,
  },
  "feed.card_variant": {
    scope: "client",
    defaultValue: "default",
    kind: "string",
    values: FEED_CARD_VARIANTS,
  },
  "theme.color": { scope: "client", defaultValue: "#fc466b", kind: "string" },
  "comment.enabled": { scope: "client", defaultValue: true, kind: "boolean" },
  "comment.guest.enabled": { scope: "client", defaultValue: true, kind: "boolean" },
  "comment.guest.auto_approve": { scope: "client", defaultValue: false, kind: "boolean" },
  "login.enabled": { scope: "client", defaultValue: true, kind: "boolean" },
  "site.name": { scope: "client", defaultValue: "Rin", env: "NAME", kind: "string" },
  "site.description": {
    scope: "client",
    defaultValue: "A lightweight personal blogging system",
    env: "DESCRIPTION",
    kind: "string",
  },
  "site.avatar": { scope: "client", defaultValue: "", env: "AVATAR", kind: "string" },
  "site.page_size": { scope: "client", defaultValue: 5, env: "PAGE_SIZE", kind: "number" },
  rss: { scope: "client", defaultValue: false, env: "RSS_ENABLE", kind: "boolean" },
  footer: { scope: "client", defaultValue: "", kind: "string" },
  friend_apply_auto_accept: { scope: "server", defaultValue: false, kind: "boolean" },
  friend_crontab: { scope: "server", defaultValue: true, kind: "boolean" },
  friend_ua: { scope: "server", defaultValue: "Rin-Check/0.1.0", kind: "string" },
  webhook_url: { scope: "server", defaultValue: "", env: "WEBHOOK_URL", kind: "string" },
  WEBHOOK_URL: { scope: "server", defaultValue: "", env: "WEBHOOK_URL", kind: "string" },
  "webhook.method": { scope: "server", defaultValue: "POST", kind: "string" },
  "webhook.content_type": { scope: "server", defaultValue: "application/json", kind: "string" },
  "webhook.headers": { scope: "server", defaultValue: "{}", kind: "string" },
  "webhook.body_template": {
    scope: "server",
    defaultValue: '{"content":"{{message}}"}',
    kind: "string",
  },
  "ai_summary.enabled": { scope: "server", defaultValue: false, kind: "boolean" },
  "ai_summary.provider": { scope: "server", defaultValue: "openai", kind: "string" },
  "ai_summary.model": { scope: "server", defaultValue: "gpt-4o-mini", kind: "string" },
  "ai_summary.api_key": { scope: "server", defaultValue: "", kind: "string", sensitive: true },
  "ai_summary.api_url": {
    scope: "server",
    defaultValue: "https://api.openai.com/v1",
    kind: "string",
  },
} as const satisfies Record<string, ConfigDefinition>;

export type ConfigKey = keyof typeof CONFIG_DEFINITIONS;
export type ClientConfigKey = {
  [K in ConfigKey]: (typeof CONFIG_DEFINITIONS)[K]["scope"] extends "client" ? K : never;
}[ConfigKey];
export type ServerConfigKey = Exclude<ConfigKey, ClientConfigKey>;

function definitionsFor(scope: "client" | "server") {
  return Object.entries(CONFIG_DEFINITIONS).filter(([, definition]) => definition.scope === scope);
}

export const CLIENT_CONFIG_DEFAULTS = new Map(
  definitionsFor("client").map(([key, definition]) => [key, definition.defaultValue]),
);

export const SERVER_CONFIG_DEFAULTS = new Map(
  definitionsFor("server").map(([key, definition]) => [key, definition.defaultValue]),
);

export const CLIENT_CONFIG_ENV_DEFAULTS: Record<string, string> = Object.fromEntries(
  definitionsFor("client").flatMap(([key, definition]) =>
    "env" in definition && definition.env ? [[key, definition.env]] : [],
  ),
);

export const WEBHOOK_URL_KEY = "WEBHOOK_URL";
export const AI_CONFIG_PREFIX = "ai_summary.";
export const AI_CONFIG_KEYS = [
  "ai_summary.enabled",
  "ai_summary.provider",
  "ai_summary.model",
  "ai_summary.api_key",
  "ai_summary.api_url",
] as const;
export const SENSITIVE_SERVER_CONFIG_FIELDS = Object.entries(CONFIG_DEFINITIONS)
  .filter(([, definition]) => "sensitive" in definition && definition.sensitive)
  .map(([key]) => key);

export const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: CONFIG_DEFINITIONS["ai_summary.enabled"].defaultValue,
  provider: CONFIG_DEFINITIONS["ai_summary.provider"].defaultValue,
  model: CONFIG_DEFINITIONS["ai_summary.model"].defaultValue,
  api_key: CONFIG_DEFINITIONS["ai_summary.api_key"].defaultValue,
  api_url: CONFIG_DEFINITIONS["ai_summary.api_url"].defaultValue,
};

export function isKnownConfigKey(key: string): key is ConfigKey {
  return key in CONFIG_DEFINITIONS;
}

export function normalizeConfigValue(key: string, value: unknown): unknown {
  if (!isKnownConfigKey(key)) return value;

  const definition = CONFIG_DEFINITIONS[key];
  if (definition.kind === "boolean") {
    if (typeof value === "string") return value.trim().toLowerCase() === "true";
    if (typeof value === "number") return value !== 0;
    return Boolean(value);
  }
  if (definition.kind === "number") {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : definition.defaultValue;
  }
  if (definition.kind === "string") {
    const normalized = typeof value === "string" ? value : String(value ?? "");
    if ("values" in definition && definition.values && !definition.values.includes(normalized as never)) {
      return definition.defaultValue;
    }
    return normalized;
  }
  return value;
}

export function normalizeFeedLayout(value: string): FeedLayout {
  return FEED_LAYOUT_OPTIONS.includes(value as FeedLayout) ? (value as FeedLayout) : "list";
}

export function normalizeFeedCardVariant(value: string): FeedCardVariant {
  return FEED_CARD_VARIANTS.includes(value as FeedCardVariant) ? (value as FeedCardVariant) : "default";
}

export function normalizeHeaderLayout(value: string | undefined | null): HeaderLayoutOption {
  return value && HEADER_LAYOUT_OPTIONS.includes(value as HeaderLayoutOption)
    ? (value as HeaderLayoutOption)
    : "classic";
}

export function normalizeHeaderBehavior(value: string | undefined | null): HeaderBehaviorOption {
  return value && HEADER_BEHAVIOR_OPTIONS.includes(value as HeaderBehaviorOption)
    ? (value as HeaderBehaviorOption)
    : "fixed";
}

export class ConfigWrapper {
  constructor(
    public config: Record<string, unknown>,
    public defaultConfig: Map<string, unknown>,
  ) {}

  get<T>(key: string) {
    const value = this.config[key];
    if (value !== undefined && value !== "") return value as T;
    if (this.defaultConfig.has(key)) return this.defaultConfig.get(key) as T;
    return undefined;
  }

  default<T>(key: string) {
    return this.defaultConfig.get(key) as T;
  }

  getBoolean(key: string) {
    return Boolean(normalizeConfigValue(key, this.get<unknown>(key)));
  }
}
