import { afterEach, describe, expect, it, mock } from "bun:test";
import { fetchPublicUrl, parsePublicHttpUrl } from "../public-url";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("public URL protection", () => {
  it("rejects local, private, credentialed, and non-http URLs", () => {
    for (const url of [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "https://user:password@example.com/",
      "file:///etc/passwd",
    ]) {
      expect(parsePublicHttpUrl(url)).toBeNull();
    }
  });

  it("rejects redirects from a public URL to a private target", async () => {
    globalThis.fetch = mock(async () => new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/private" },
    })) as typeof fetch;

    await expect(fetchPublicUrl("https://example.com/")).rejects.toThrow("Unsafe public URL redirect");
  });
});
