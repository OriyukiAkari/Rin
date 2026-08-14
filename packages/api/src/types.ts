// ============================================================================
// Shared API Types - Used by both client and server
// ============================================================================

// Common types
export type { AIConfig } from "@rin/config";
export interface ApiResponse<T> {
  data?: T;
  error?: {
    status: number;
    value: string;
  };
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

// ============================================================================
// Feed Types
// ============================================================================

export interface Feed {
  id: number;
  title: string | null;
  content: string;
  uid: number;
  createdAt: string;
  updatedAt: string;
  ai_summary: string;
  ai_summary_status: "idle" | "pending" | "processing" | "completed" | "failed";
  ai_summary_error: string;
  hashtags: Array<{ id: number; name: string }>;
  user: {
    avatar: string | null;
    id: number;
    username: string;
  };
  pv: number;
  uv: number;
  top?: number;
}

export interface FeedListResponse {
  size: number;
  data: Array<{
    id: number;
    title: string | null;
    summary: string;
    hashtags: Array<{ id: number; name: string }>;
    user: {
      avatar: string | null;
      id: number;
      username: string;
    };
    avatar: string | null;
    createdAt: string;
    updatedAt: string;
    pv: number;
    uv: number;
  }>;
  hasNext: boolean;
}

export interface TimelineItem {
  id: number;
  title: string | null;
  createdAt: string;
}

export interface CreateFeedRequest {
  title: string;
  content: string;
  summary?: string;
  alias?: string;
  draft: boolean;
  listed: boolean;
  createdAt?: string;
  tags: string[];
}

export interface UpdateFeedRequest {
  title?: string;
  content?: string;
  summary?: string;
  alias?: string;
  listed: boolean;
  draft?: boolean;
  createdAt?: string;
  tags?: string[];
  top?: number;
}

export interface AdjacentFeed {
  id: number;
  title: string | null;
  summary: string;
  hashtags: Array<{ id: number; name: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdjacentFeedResponse {
  previousFeed: AdjacentFeed | null;
  nextFeed: AdjacentFeed | null;
}

// ============================================================================
// User Types
// ============================================================================

export interface UserProfile {
  id: number;
  username: string;
  avatar: string | null;
  permission: boolean;
}

export interface UpdateProfileRequest {
  username?: string;
  avatar?: string | null;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthStatus {
  github: boolean;
  password: boolean;
}

// ============================================================================
// Tag Types
// ============================================================================

export interface Tag {
  id: number;
  name: string;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagDetail extends Tag {
  feeds: Feed[];
}

// ============================================================================
// Comment Types
// ============================================================================

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** 登录用户的评论 */
  user?: {
    id: number;
    username: string;
    avatar: string | null;
    permission: number | null;
  } | null;
  /** 游客评论的昵称 */
  guestName?: string;
  /** 游客评论的邮箱 */
  guestEmail?: string;
  /** 游客评论的网站 */
  guestWebsite?: string;
  /** 审核状态 */
  approved: boolean;
}

export interface CreateCommentRequest {
  content: string;
  /** 游客昵称（未登录时必填） */
  guestName?: string;
  /** 游客邮箱（可选） */
  guestEmail?: string;
  /** 游客网站（可选） */
  guestWebsite?: string;
}

// ============================================================================
// Friend Types
// ============================================================================

export interface Friend {
  id: number;
  name: string;
  desc: string | null;
  avatar: string;
  url: string;
  accepted: number;
  sort_order: number | null;
  createdAt: string;
  uid: number;
  updatedAt: string;
  health: string;
}

export interface FriendListResponse {
  friend_list: Friend[];
  apply_list: Friend | null;
}

export interface CreateFriendRequest {
  name: string;
  desc: string;
  avatar: string;
  url: string;
}

export interface UpdateFriendRequest {
  name: string;
  desc: string;
  avatar?: string;
  url: string;
  accepted?: number;
  sort_order?: number;
}

// ============================================================================
// Moment Types
// ============================================================================

export interface Moment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    username: string;
    avatar: string;
  };
}

export interface CreateMomentRequest {
  content: string;
}

export interface MomentListResponse {
  data: Moment[];
  hasNext: boolean;
}

// ============================================================================
// Config Types
// ============================================================================

export type ConfigType = 'client' | 'server';

export interface ConfigResponse {
  [key: string]: unknown;
}

export interface SettingsConfigResponse {
  clientConfig: ConfigResponse;
  serverConfig: ConfigResponse;
}

export interface LocalizedMessage {
  key: string;
  values?: Record<string, string | number | boolean>;
}

export interface ConfigHealthItem {
  id: string;
  title: LocalizedMessage;
  status: "success" | "warning" | "danger";
  configured: boolean;
  impact: LocalizedMessage;
  summary: LocalizedMessage;
  suggestion?: LocalizedMessage;
  details?: LocalizedMessage[];
}

export interface ConfigHealthResponse {
  generatedAt: string;
  summary: Record<"success" | "warning" | "danger", number>;
  items: ConfigHealthItem[];
}

export type AISummaryStatus = "idle" | "pending" | "processing" | "completed" | "failed";

export interface QueueStatusItem {
  id: number;
  title: string | null;
  aiSummaryStatus: AISummaryStatus;
  aiSummaryError: string;
  updatedAt: string;
  createdAt: string;
}

export interface QueueStatusResponse {
  queueConfigured: boolean;
  generatedAt: string;
  summary: Record<AISummaryStatus, number>;
  items: QueueStatusItem[];
}

export interface QueueTaskActionResponse {
  success: boolean;
}

export interface CompatTasksResponse {
  generatedAt: string;
  aiSummary: {
    enabled: boolean;
    queueConfigured: boolean;
    eligible: number;
    forceEligible: number;
  };
  blurhash: { eligible: number };
}

export interface CompatAISummaryActionResponse {
  queued: number;
  skipped: number;
  forced: boolean;
}

export interface CompatBlurhashCandidate {
  id: number;
  title: string | null;
  content: string;
}

export interface CompatBlurhashCandidatesResponse {
  generatedAt: string;
  items: CompatBlurhashCandidate[];
}

export interface CompatBlurhashApplyResponse {
  updated: boolean;
}

export interface TestAIRequest {
  provider?: string;
  model?: string;
  api_url?: string;
  api_key?: string;
  testPrompt?: string;
}

export interface TestAIResponse {
  success: boolean;
  response?: string;
  error?: string;
  details?: string;
  provider?: string;
  model?: string;
}

export interface TestWebhookRequest {
  webhook_url?: string;
  "webhook.method"?: string;
  "webhook.content_type"?: string;
  "webhook.headers"?: string;
  "webhook.body_template"?: string;
  test_message?: string;
}

export interface TestWebhookResponse {
  success: boolean;
  error?: string;
  details?: string;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface UploadResponse {
  url: string;
}

// ============================================================================
// Search Types
// ============================================================================

// Uses FeedListResponse

// ============================================================================
// WordPress Import Types
// ============================================================================

export interface WordPressImportResponse {
  success: number;
  skipped: number;
  skippedList: Array<{ title: string; reason: string }>;
}

// ============================================================================
// API Endpoint Paths
// ============================================================================

export const API_PATHS = {
  // Feed
  FEED_LIST: '/api/feed',
  FEED_TIMELINE: '/api/feed/timeline',
  FEED_GET: (id: number | string) => `/api/feed/${id}`,
  FEED_CREATE: '/api/feed',
  FEED_UPDATE: (id: number) => `/api/feed/${id}`,
  FEED_DELETE: (id: number) => `/api/feed/${id}`,
  FEED_ADJACENT: (id: number | string) => `/api/feed/adjacent/${id}`,
  FEED_SET_TOP: (id: number) => `/api/feed/top/${id}`,

  // Auth
  AUTH_STATUS: '/api/auth/status',

  // User
  USER_PROFILE: '/api/user/profile',
  USER_UPDATE_PROFILE: '/api/user/profile',
  USER_LOGOUT: '/api/user/logout',
  USER_GITHUB: '/api/user/github',

  // Tag
  TAG_LIST: '/api/tag',
  TAG_GET: (name: string) => `/api/tag/${encodeURIComponent(name)}`,

  // Comment
  COMMENT_LIST: (feedId: number) => `/api/comment/${feedId}`,
  COMMENT_CREATE: (feedId: number) => `/api/comment/${feedId}`,
  COMMENT_DELETE: (id: number) => `/api/comment/${id}`,
  COMMENT_APPROVE: (id: number) => `/api/comment/approve/${id}`,

  // Friend
  FRIEND_LIST: '/api/friend',
  FRIEND_CREATE: '/api/friend',
  FRIEND_UPDATE: (id: number) => `/api/friend/${id}`,
  FRIEND_DELETE: (id: number) => `/api/friend/${id}`,

  // Moments
  MOMENTS_LIST: '/api/moments',
  MOMENTS_CREATE: '/api/moments',
  MOMENTS_UPDATE: (id: number) => `/api/moments/${id}`,
  MOMENTS_DELETE: (id: number) => `/api/moments/${id}`,

  // Config
  CONFIG_ALL: '/api/config',
  CONFIG_GET: (type: ConfigType) => `/api/config/${type}`,
  CONFIG_UPDATE: (type: ConfigType) => `/api/config/${type}`,
  CONFIG_CLEAR_CACHE: '/api/config/cache',
  CONFIG_HEALTH: '/api/config/health',
  CONFIG_QUEUE_STATUS: '/api/config/queue-status',
  CONFIG_QUEUE_RETRY: (feedId: number) => `/api/config/queue-status/${feedId}/retry`,
  CONFIG_QUEUE_DELETE: (feedId: number) => `/api/config/queue-status/${feedId}`,
  CONFIG_COMPAT_TASKS: '/api/config/compat-tasks',
  CONFIG_COMPAT_AI: '/api/config/compat-tasks/ai-summary',
  CONFIG_COMPAT_BLURHASH: '/api/config/compat-tasks/blurhash',
  CONFIG_COMPAT_BLURHASH_APPLY: (feedId: number) => `/api/config/compat-tasks/blurhash/${feedId}`,
  CONFIG_TEST_AI: '/api/config/test-ai',
  CONFIG_TEST_WEBHOOK: '/api/config/test-webhook',

  // Storage
  STORAGE_UPLOAD: '/api/storage',

  // Favicon
  FAVICON_GET: '/api/favicon',
  FAVICON_GET_ORIGINAL: '/api/favicon/original',
  FAVICON_UPLOAD: '/api/favicon',

  // Search
  SEARCH: (keyword: string) => `/api/search/${encodeURIComponent(keyword)}`,

  // WordPress
  WP_IMPORT: '/api/wp',

  // RSS
  RSS_GET: (name: string) => `/${encodeURIComponent(name)}`,
} as const;

export type APIEndpoint = typeof API_PATHS;
