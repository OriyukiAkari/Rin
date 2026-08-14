import {
  API_PATHS,
  type CompatAISummaryActionResponse,
  type CompatBlurhashApplyResponse,
  type CompatBlurhashCandidatesResponse,
  type CompatTasksResponse,
  type ConfigHealthResponse,
  type ConfigResponse,
  type ConfigType,
  type QueueStatusResponse,
  type QueueTaskActionResponse,
  type SettingsConfigResponse,
  type TestAIRequest,
  type TestAIResponse,
  type TestWebhookRequest,
  type TestWebhookResponse,
} from "@rin/api";
import type { HttpClient } from "./http";

export class ConfigAPI {
  constructor(private readonly http: HttpClient) {}

  getAll() {
    return this.http.get<SettingsConfigResponse>(API_PATHS.CONFIG_ALL);
  }

  get(type: ConfigType) {
    return this.http.get<ConfigResponse>(API_PATHS.CONFIG_GET(type));
  }

  updateAll(body: SettingsConfigResponse) {
    return this.http.post<SettingsConfigResponse>(API_PATHS.CONFIG_ALL, body);
  }

  update(type: ConfigType, body: Record<string, unknown>) {
    return this.http.post<void>(API_PATHS.CONFIG_UPDATE(type), body);
  }

  clearCache() {
    return this.http.delete<void>(API_PATHS.CONFIG_CLEAR_CACHE);
  }

  getHealth() {
    return this.http.get<ConfigHealthResponse>(API_PATHS.CONFIG_HEALTH);
  }

  getQueueStatus() {
    return this.http.get<QueueStatusResponse>(API_PATHS.CONFIG_QUEUE_STATUS);
  }

  getCompatTasks() {
    return this.http.get<CompatTasksResponse>(API_PATHS.CONFIG_COMPAT_TASKS);
  }

  runCompatAISummary(force = false) {
    return this.http.post<CompatAISummaryActionResponse>(API_PATHS.CONFIG_COMPAT_AI, { force });
  }

  getCompatBlurhashCandidates() {
    return this.http.get<CompatBlurhashCandidatesResponse>(API_PATHS.CONFIG_COMPAT_BLURHASH);
  }

  applyCompatBlurhash(feedId: number, content: string) {
    return this.http.post<CompatBlurhashApplyResponse>(API_PATHS.CONFIG_COMPAT_BLURHASH_APPLY(feedId), { content });
  }

  retryQueueTask(feedId: number) {
    return this.http.post<QueueTaskActionResponse>(API_PATHS.CONFIG_QUEUE_RETRY(feedId));
  }

  deleteQueueTask(feedId: number) {
    return this.http.delete<QueueTaskActionResponse>(API_PATHS.CONFIG_QUEUE_DELETE(feedId));
  }

  testAI(body: TestAIRequest) {
    return this.http.post<TestAIResponse>(API_PATHS.CONFIG_TEST_AI, body);
  }

  testWebhook(body: TestWebhookRequest) {
    return this.http.post<TestWebhookResponse>(API_PATHS.CONFIG_TEST_WEBHOOK, body);
  }
}
