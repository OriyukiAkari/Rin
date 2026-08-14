import { describe, expect, it } from "bun:test";
import {
  buildWranglerObservabilityConfig,
  buildPagesWranglerConfig,
  buildDefaultR2BucketName,
  buildWranglerQueueConfig,
  buildWranglerTriggersConfig,
  collectWorkerSecrets,
  includesPagesProject,
} from "./deploy-cf";

describe("buildPagesWranglerConfig", () => {
  it("binds Pages Functions to the backend Worker", () => {
    const config = buildPagesWranglerConfig("rin-web", "rin-server");

    expect(config).toContain('name = "rin-web"');
    expect(config).toContain('pages_build_output_dir = "../dist/client"');
    expect(config).toContain('binding = "RIN_API"');
    expect(config).toContain('service = "rin-server"');
    expect(config).not.toContain("[assets]");
  });
});

describe("includesPagesProject", () => {
  it("recognizes Wrangler's JSON display field", () => {
    expect(includesPagesProject([{ "Project Name": "rin-client" }], "rin-client")).toBe(true);
    expect(includesPagesProject([{ "Project Name": "another-site" }], "rin-client")).toBe(false);
  });
});

describe("buildDefaultR2BucketName", () => {
  it("derives an isolated valid bucket name from the Worker", () => {
    expect(buildDefaultR2BucketName("Rin_Server-pr-12")).toBe("rin-server-pr-12-objects");
  });
});

describe("collectWorkerSecrets", () => {
  it("includes supported non-empty worker secrets", () => {
    const secrets = collectWorkerSecrets({
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
      UNUSED: "ignored",
    });

    expect(secrets).toEqual({
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
  });

  it("omits empty secret values", () => {
    const secrets = collectWorkerSecrets({
      JWT_SECRET: "",
      ADMIN_USERNAME: undefined,
      ADMIN_PASSWORD: "password",
    });

    expect(secrets).toEqual({
      ADMIN_PASSWORD: "password",
    });
  });
});

describe("buildWranglerTriggersConfig", () => {
  it("omits cron triggers for preview deploys", () => {
    expect(buildWranglerTriggersConfig(true)).toBe("");
  });

  it("includes cron triggers for production deploys", () => {
    expect(buildWranglerTriggersConfig(false)).toContain("[triggers]");
    expect(buildWranglerTriggersConfig(false)).toContain('crons = ["*/20 * * * *"]');
  });
});

describe("buildWranglerQueueConfig", () => {
  it("includes queue consumers for preview deploys", () => {
    const config = buildWranglerQueueConfig("rin-preview-tasks", true);
    expect(config).toContain('queue = "rin-preview-tasks"');
    expect(config).toContain("[[queues.consumers]]");
  });

  it("includes queue consumers for production deploys", () => {
    const config = buildWranglerQueueConfig("rin-tasks", false);
    expect(config).toContain("[[queues.producers]]");
    expect(config).toContain("[[queues.consumers]]");
  });
});

describe("buildWranglerObservabilityConfig", () => {
  it("enables invocation logs and disables traces for preview deploys", () => {
    const config = buildWranglerObservabilityConfig(true);
    expect(config).toContain("[observability]");
    expect(config).toContain("[observability.logs]");
    expect(config).toContain("enabled = true");
    expect(config).toContain("invocation_logs = true");
    expect(config).toContain("[observability.traces]");
    expect(config).toContain("enabled = false");
  });

  it("omits observability overrides for production deploys", () => {
    expect(buildWranglerObservabilityConfig(false)).toBe("");
  });
});
