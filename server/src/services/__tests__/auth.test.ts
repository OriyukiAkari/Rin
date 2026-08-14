import { describe, expect, it } from "bun:test";
import { setupTestApp } from "../../../tests/fixtures";
import { AuthService } from "../auth";

describe("AuthService", () => {
  it("always rejects password login, even when legacy credentials exist", async () => {
    const { app, env, sqlite } = await setupTestApp(AuthService, {
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123",
    } as Partial<Env>);

    try {
      const res = await app.request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" }),
      }, env);

      expect(res.status).toBe(403);
      expect(await res.text()).toContain("Password login is disabled");
    } finally {
      sqlite.close();
    }
  });

  it("reports creator-only GitHub OAuth as the sole login method", async () => {
    const { app, env, sqlite } = await setupTestApp(AuthService, {
      RIN_GITHUB_ADMIN_ID: "456",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123",
    } as Partial<Env>);

    try {
      const res = await app.request("/status", { method: "GET" }, env);
      expect(res.status).toBe(200);
      expect(await res.json() as unknown).toEqual({ github: true, password: false });
    } finally {
      sqlite.close();
    }
  });

  it("does not advertise OAuth without the creator GitHub ID", async () => {
    const { app, env, sqlite } = await setupTestApp(AuthService, {
      RIN_GITHUB_ADMIN_ID: "",
    });

    try {
      const res = await app.request("/status", { method: "GET" }, env);
      expect(await res.json() as unknown).toEqual({ github: false, password: false });
    } finally {
      sqlite.close();
    }
  });
});
