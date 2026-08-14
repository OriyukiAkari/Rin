import {
  API_PATHS,
  type AdjacentFeedResponse,
  type ApiResponse,
  type CreateFeedRequest,
  type Feed,
  type FeedListResponse,
  type Tag,
  type TagDetail,
  type TimelineItem,
  type UpdateFeedRequest,
  type WordPressImportResponse,
} from "@rin/api";
import type { HttpClient } from "./http";

function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export class FeedAPI {
  constructor(private readonly http: HttpClient) {}

  list(params?: { page?: number; limit?: number; type?: "draft" | "unlisted" | "normal" }) {
    return this.http.get<FeedListResponse>(withQuery(API_PATHS.FEED_LIST, params || {}));
  }

  timeline() {
    return this.http.get<TimelineItem[]>(API_PATHS.FEED_TIMELINE);
  }

  get(id: number | string) {
    return this.http.get<Feed>(API_PATHS.FEED_GET(id));
  }

  create(body: CreateFeedRequest) {
    return this.http.post<{ insertedId: number }>(API_PATHS.FEED_CREATE, body);
  }

  update(id: number, body: UpdateFeedRequest) {
    return this.http.post<void>(API_PATHS.FEED_UPDATE(id), body);
  }

  delete(id: number) {
    return this.http.delete<void>(API_PATHS.FEED_DELETE(id));
  }

  adjacent(id: number | string) {
    return this.http.get<AdjacentFeedResponse>(API_PATHS.FEED_ADJACENT(id));
  }

  setTop(id: number, top: number) {
    return this.http.post<void>(API_PATHS.FEED_SET_TOP(id), { top });
  }
}

export class TagAPI {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<ApiResponse<Tag[]>> {
    return this.http.get<Tag[]>(API_PATHS.TAG_LIST);
  }

  get(name: string) {
    return this.http.get<TagDetail>(API_PATHS.TAG_GET(name));
  }
}

export class SearchAPI {
  constructor(private readonly http: HttpClient) {}

  search(keyword: string, params?: { page?: number; limit?: number }) {
    return this.http.get<FeedListResponse>(withQuery(API_PATHS.SEARCH(keyword), params || {}));
  }
}

export class WordPressAPI {
  constructor(private readonly http: HttpClient) {}

  import(file: File) {
    const formData = new FormData();
    formData.append("data", file);
    return this.http.post<WordPressImportResponse>(API_PATHS.WP_IMPORT, formData);
  }
}

export class RSSAPI {
  constructor(private readonly http: HttpClient) {}

  private async text(name: string) {
    return fetch(this.http.resolve(API_PATHS.RSS_GET(name))).then((response) => response.text());
  }

  getRSS() {
    return this.text("rss.xml");
  }

  getAtom() {
    return this.text("atom.xml");
  }

  getJSON(): Promise<unknown> {
    return fetch(this.http.resolve(API_PATHS.RSS_GET("rss.json"))).then((response) => response.json());
  }
}
