import {
  API_PATHS,
  type AuthStatus,
  type LoginRequest,
  type LoginResponse,
  type UpdateProfileRequest,
  type UserProfile,
} from "@rin/api";
import type { HttpClient } from "./http";

export class UserAPI {
  constructor(private readonly http: HttpClient) {}

  profile() {
    return this.http.get<UserProfile>(API_PATHS.USER_PROFILE);
  }

  updateProfile(body: UpdateProfileRequest) {
    return this.http.put<{ success: boolean }>(API_PATHS.USER_UPDATE_PROFILE, body);
  }

  logout() {
    return this.http.post<void>(API_PATHS.USER_LOGOUT);
  }

  githubAuth() {
    return this.http.resolve(API_PATHS.USER_GITHUB);
  }
}

export class AuthAPI {
  constructor(private readonly http: HttpClient) {}

  status() {
    return this.http.get<AuthStatus>(API_PATHS.AUTH_STATUS);
  }

  login(body: LoginRequest) {
    return this.http.post<LoginResponse>(API_PATHS.AUTH_LOGIN, body);
  }
}
