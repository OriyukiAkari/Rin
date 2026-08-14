import { describe, expect, it } from "bun:test";
import { validateCreatorAuthConfig } from "./auth-config";

describe("validateCreatorAuthConfig", () => {
  it("accepts creator-only GitHub OAuth with a strong JWT secret", () => {
    expect(validateCreatorAuthConfig({
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      RIN_GITHUB_ADMIN_ID: "456",
      JWT_SECRET: "0123456789abcdef0123456789abcdef",
    })).toEqual([]);
  });

  it("rejects missing creator identity and placeholder secrets", () => {
    const errors = validateCreatorAuthConfig({
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      RIN_GITHUB_ADMIN_ID: "not-numeric",
      JWT_SECRET: "your-jwt-secret-key",
    });

    expect(errors.some((error) => error.includes("numeric GitHub user ID"))).toBe(true);
    expect(errors.some((error) => error.includes("32 bytes"))).toBe(true);
    expect(errors.some((error) => error.includes("placeholder"))).toBe(true);
  });
});
