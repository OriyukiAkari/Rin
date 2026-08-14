import type { ApiResponse, RequestOptions } from "@rin/api";

export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  resolve(path: string) {
    return `${this.baseUrl}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options?.headers,
    };

    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(this.resolve(path), {
        method,
        headers,
        body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
        credentials: "include",
      });

      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return { data: undefined as T };
      }

      if (!response.ok) {
        const responseClone = response.clone();
        let errorValue: unknown;
        try {
          errorValue = await response.json();
        } catch {
          errorValue = await responseClone.text();
        }

        let errorMessage: string;
        if (typeof errorValue === "string") {
          errorMessage = errorValue;
        } else if (errorValue && typeof errorValue === "object") {
          const candidate = errorValue as { error?: { message?: string } | string; message?: string };
          errorMessage =
            (typeof candidate.error === "object" ? candidate.error.message : candidate.error) ||
            candidate.message ||
            JSON.stringify(errorValue);
        } else {
          errorMessage = String(errorValue ?? response.statusText);
        }

        return { error: { status: response.status, value: errorMessage } };
      }

      if (response.headers.get("content-type")?.includes("application/json")) {
        return { data: (await response.json()) as T };
      }
      return { data: (await response.text()) as T };
    } catch (error) {
      return {
        error: {
          status: 0,
          value: error instanceof Error ? error.message : "Network error",
        },
      };
    }
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("POST", path, body, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PUT", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PATCH", path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, undefined, options);
  }
}
