import * as fs from "node:fs";
import * as path from "node:path";
import { parseEnv } from "../lib/env";

const toml = (value: string | undefined) => JSON.stringify(value || "");

export async function runSetupDev() {
  const rootDir = process.cwd();
  const envFile = path.join(rootDir, ".env.local");

  if (!fs.existsSync(envFile)) {
    console.error("❌ 错误：找不到 .env.local 文件");
    console.log("\n请执行以下步骤：");
    console.log("  1. cp .env.example .env.local");
    console.log("  2. 编辑 .env.local 填入你的配置");
    console.log("  3. 重新运行 dev 命令\n");
    process.exit(1);
  }

  const env = parseEnv(fs.readFileSync(envFile, "utf-8"));
  const baseRequiredVars = [
    "NAME",
    "AVATAR",
    "JWT_SECRET",
  ];
  const storageRequiredVars = env.R2_BUCKET_NAME
    ? []
    : ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const requiredVars = [...baseRequiredVars, ...storageRequiredVars];

  const missingVars = requiredVars.filter((name) => !env[name]);
  if (missingVars.length > 0) {
    console.error("❌ 错误：以下必要环境变量未设置：");
    missingVars.forEach((name) => console.error(`   - ${name}`));
    console.log("\n请编辑 .env.local 文件并添加这些配置\n");
    process.exit(1);
  }

  const githubAuthConfigured = Boolean(
    env.RIN_GITHUB_CLIENT_ID && env.RIN_GITHUB_CLIENT_SECRET,
  );
  const passwordAuthConfigured = Boolean(
    env.ADMIN_USERNAME && env.ADMIN_PASSWORD,
  );
  const githubAdminConfigured = Boolean(env.RIN_GITHUB_ADMIN_ID);

  if (!githubAuthConfigured && !passwordAuthConfigured) {
    console.error("❌ 错误：至少需要配置一种登录方式：");
    console.error("   - RIN_GITHUB_CLIENT_ID + RIN_GITHUB_CLIENT_SECRET");
    console.error("   - ADMIN_USERNAME + ADMIN_PASSWORD");
    console.log("\n请编辑 .env.local 文件并添加其中一组配置\n");
    process.exit(1);
  }

  if (githubAuthConfigured && !passwordAuthConfigured && !githubAdminConfigured) {
    console.error("❌ 错误：仅使用 GitHub OAuth 时必须设置 RIN_GITHUB_ADMIN_ID");
    process.exit(1);
  }

  const wranglerContent = `#:schema node_modules/wrangler/config-schema.json
name = ${toml(env.WORKER_NAME || "rin-server")}
main = "server/src/_worker.ts"
compatibility_date = "2026-01-20"

[triggers]
crons = ["*/20 * * * *"]

[vars]
S3_FOLDER = ${toml(env.S3_FOLDER || "images/")}
S3_CACHE_FOLDER = ${toml(env.S3_CACHE_FOLDER || "cache/")}
S3_REGION = ${toml(env.S3_REGION || "auto")}
S3_ENDPOINT = ${toml(env.S3_ENDPOINT)}
S3_ACCESS_HOST = ${toml(env.S3_ACCESS_HOST)}
S3_BUCKET = ${toml(env.S3_BUCKET)}
S3_FORCE_PATH_STYLE = ${toml(env.S3_FORCE_PATH_STYLE || "false")}
WEBHOOK_URL = ${toml(env.WEBHOOK_URL)}
RSS_TITLE = ${toml(env.RSS_TITLE || "Rin Development")}
RSS_DESCRIPTION = ${toml(env.RSS_DESCRIPTION || "Development Environment")}
CACHE_STORAGE_MODE = ${toml(env.CACHE_STORAGE_MODE || "s3")}
SITE_URL = ${toml(env.SITE_URL)}
CORS_ALLOWED_ORIGINS = ${toml(env.CORS_ALLOWED_ORIGINS)}
VISIT_RETENTION_DAYS = ${toml(env.VISIT_RETENTION_DAYS || "30")}

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = ${toml(env.DB_NAME || "rin")}
database_id = "local"

[[queues.producers]]
binding = "TASK_QUEUE"
queue = ${toml(env.TASK_QUEUE_NAME || env.AI_SUMMARY_QUEUE_NAME || `${env.WORKER_NAME || "rin-server"}-tasks`)}

[[queues.consumers]]
queue = ${toml(env.TASK_QUEUE_NAME || env.AI_SUMMARY_QUEUE_NAME || `${env.WORKER_NAME || "rin-server"}-tasks`)}
max_batch_size = 1
max_batch_timeout = 5
${env.R2_BUCKET_NAME
  ? `

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = ${toml(env.R2_BUCKET_NAME)}
preview_bucket_name = ${toml(env.R2_BUCKET_NAME)}`
  : ""}
`;

  fs.writeFileSync(path.join(rootDir, "wrangler.toml"), wranglerContent);
  fs.writeFileSync(
    path.join(rootDir, "client", ".env"),
    `NAME=${env.NAME}
DESCRIPTION=${env.DESCRIPTION || ""}
AVATAR=${env.AVATAR}
PAGE_SIZE=${env.PAGE_SIZE || "5"}
RSS_ENABLE=${env.RSS_ENABLE || "false"}
`,
  );
  fs.writeFileSync(
    path.join(rootDir, ".dev.vars"),
    `RIN_GITHUB_CLIENT_ID=${env.RIN_GITHUB_CLIENT_ID}
RIN_GITHUB_CLIENT_SECRET=${env.RIN_GITHUB_CLIENT_SECRET}
RIN_GITHUB_ADMIN_ID=${env.RIN_GITHUB_ADMIN_ID || ""}
JWT_SECRET=${env.JWT_SECRET}
ADMIN_USERNAME=${env.ADMIN_USERNAME || ""}
ADMIN_PASSWORD=${env.ADMIN_PASSWORD || ""}
S3_ACCESS_KEY_ID=${env.S3_ACCESS_KEY_ID || ""}
S3_SECRET_ACCESS_KEY=${env.S3_SECRET_ACCESS_KEY || ""}
`,
  );

  console.log("✅ 已生成 wrangler.toml");
  console.log("✅ 已生成 client/.env");
  console.log("✅ 已生成 .dev.vars");
  console.log("\n🎉 配置加载完成！");
  console.log("   现在可以运行：bun run dev\n");
}
