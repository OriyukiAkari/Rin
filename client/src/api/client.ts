import { AuthAPI, UserAPI } from "./account";
import { CommentAPI, FriendAPI, MomentsAPI } from "./community";
import { ConfigAPI } from "./config-api";
import { FeedAPI, RSSAPI, SearchAPI, TagAPI, WordPressAPI } from "./content";
import { HttpClient } from "./http";
import { StorageAPI } from "./storage-api";

export * from "@rin/api";

export class ApiClient {
  readonly auth: AuthAPI;
  readonly comment: CommentAPI;
  readonly config: ConfigAPI;
  readonly feed: FeedAPI;
  readonly friend: FriendAPI;
  readonly moments: MomentsAPI;
  readonly rss: RSSAPI;
  readonly search: SearchAPI;
  readonly storage: StorageAPI;
  readonly tag: TagAPI;
  readonly user: UserAPI;
  readonly wp: WordPressAPI;

  constructor(baseUrl: string) {
    const http = new HttpClient(baseUrl);
    this.auth = new AuthAPI(http);
    this.comment = new CommentAPI(http);
    this.config = new ConfigAPI(http);
    this.feed = new FeedAPI(http);
    this.friend = new FriendAPI(http);
    this.moments = new MomentsAPI(http);
    this.rss = new RSSAPI(http);
    this.search = new SearchAPI(http);
    this.storage = new StorageAPI(http);
    this.tag = new TagAPI(http);
    this.user = new UserAPI(http);
    this.wp = new WordPressAPI(http);
  }
}

export function createClient(baseUrl: string) {
  return new ApiClient(baseUrl);
}

export default ApiClient;
