import { API_PATHS, type UploadResponse } from "@rin/api";
import type { HttpClient } from "./http";

export class StorageAPI {
  constructor(private readonly http: HttpClient) {}

  upload(file: File, key?: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (key) formData.append("key", key);
    return this.http.post<UploadResponse>(API_PATHS.STORAGE_UPLOAD, formData);
  }
}
