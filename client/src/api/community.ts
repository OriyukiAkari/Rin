import {
  API_PATHS,
  type Comment,
  type CreateCommentRequest,
  type CreateFriendRequest,
  type CreateMomentRequest,
  type Friend,
  type FriendListResponse,
  type Moment,
  type MomentListResponse,
  type UpdateFriendRequest,
} from "@rin/api";
import type { HttpClient } from "./http";

export class CommentAPI {
  constructor(private readonly http: HttpClient) {}

  list(feedId: number) {
    return this.http.get<Comment[]>(API_PATHS.COMMENT_LIST(feedId));
  }

  create(feedId: number, body: CreateCommentRequest) {
    return this.http.post<Comment>(API_PATHS.COMMENT_CREATE(feedId), body);
  }

  delete(id: number) {
    return this.http.delete<void>(API_PATHS.COMMENT_DELETE(id));
  }

  approve(id: number) {
    return this.http.post<void>(API_PATHS.COMMENT_APPROVE(id));
  }
}

export class FriendAPI {
  constructor(private readonly http: HttpClient) {}

  list() {
    return this.http.get<FriendListResponse>(API_PATHS.FRIEND_LIST);
  }

  create(body: CreateFriendRequest) {
    return this.http.post<Friend>(API_PATHS.FRIEND_CREATE, body);
  }

  update(id: number, body: UpdateFriendRequest) {
    return this.http.put<void>(API_PATHS.FRIEND_UPDATE(id), body);
  }

  delete(id: number) {
    return this.http.delete<void>(API_PATHS.FRIEND_DELETE(id));
  }
}

export class MomentsAPI {
  constructor(private readonly http: HttpClient) {}

  list(params?: { page?: number; limit?: number }) {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    const query = search.toString();
    return this.http.get<MomentListResponse>(`${API_PATHS.MOMENTS_LIST}${query ? `?${query}` : ""}`);
  }

  create(body: CreateMomentRequest) {
    return this.http.post<Moment>(API_PATHS.MOMENTS_CREATE, body);
  }

  update(id: number, body: CreateMomentRequest) {
    return this.http.post<void>(API_PATHS.MOMENTS_UPDATE(id), body);
  }

  delete(id: number) {
    return this.http.delete<void>(API_PATHS.MOMENTS_DELETE(id));
  }
}
