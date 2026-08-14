import { $ } from "bun";
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import stripIndent from "strip-indent";
import { fixTopField, getMigrationFileVersion, getMigrationVersion, isInfoExist, updateMigrationVersion } from "../lib/db-migration";
const bunExec = process.execPath;
const toml = (value: string | undefined) => JSON.stringify(value || "");
const WORKER_CONFIG_PATH = "wrangler.toml";
const PAGES_CONFIG_PATH = "pages/wrangler.toml";

function env(name: string, defaultValue?: string, required = false) {
  const value = process.env[name] || defaultValue;
  if (required && !value) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

const renv = (name: string, defaultValue?: string) => env(name, defaultValue, true)!;

function requireCloudflareResourceName(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters`);
  }
  return value;
}

function requireR2BucketName(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) {
    throw new Error("R2_BUCKET_NAME must use 3-63 lowercase letters, numbers, or hyphens");
  }
  return value;
}

export function buildDefaultR2BucketName(workerName: string) {
  const normalized = workerName.toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]/g, "");
  return `${normalized}-objects`.slice(0, 63).replace(/-+$/, "");
}

const WORKER_SECRET_KEYS = [
  "JWT_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "RIN_GITHUB_CLIENT_ID",
  "RIN_GITHUB_CLIENT_SECRET",
  "RIN_GITHUB_ADMIN_ID",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

function isQueueAlreadyPresentError(stderr: string) {
  return stderr.includes("already exists") || stderr.includes("already taken") || stderr.includes("[code: 11009]");
}

function isResourceAlreadyPresentError(stderr: string) {
  const message = stderr.toLowerCase();
  return message.includes("already exists") || message.includes("already taken");
}

export function collectWorkerSecrets(source: Record<string, string | undefined> = process.env) {
  const secrets: Record<string, string> = {};

  for (const key of WORKER_SECRET_KEYS) {
    const value = source[key];
    if (value && value.length > 0) {
      secrets[key] = value;
    }
  }

  return secrets;
}

async function syncWorkerSecrets(workerName: string) {
  const secrets = collectWorkerSecrets();
  const secretKeys = Object.keys(secrets);

  if (secretKeys.length === 0) {
    console.log("ℹ️ No worker secrets provided; skipping secret sync");
    return;
  }

  const tempFile = ".wrangler-secrets.json";
  await Bun.write(tempFile, JSON.stringify(secrets, null, 2));

  try {
    await $`${bunExec} x wrangler secret bulk ${tempFile} --name ${workerName}`;
    console.log(`✅ Synced ${secretKeys.length} worker secret(s)`);
  } finally {
    await unlink(tempFile).catch(() => {});
  }
}

async function buildClient() {
  console.log("🔨 Building client...");
  await $`cd client && ${bunExec} run build`.quiet();
  console.log("✅ Client built successfully");
}

export function buildPagesWranglerConfig(pagesName: string, workerName: string) {
  return stripIndent(`
    #:schema ../node_modules/wrangler/config-schema.json
    name = ${toml(pagesName)}
    pages_build_output_dir = "../dist/client"
    compatibility_date = "2026-01-20"

    [[services]]
    binding = "RIN_API"
    service = ${toml(workerName)}
  `);
}

export function includesPagesProject(
  projects: Array<{ "Project Name"?: string; name?: string }>,
  pagesName: string,
) {
  return projects.some((project) => project["Project Name"] === pagesName || project.name === pagesName);
}

async function ensurePagesProject(pagesName: string, productionBranch: string) {
  const result = await $`${bunExec} x wrangler pages project list --json --cwd pages`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`Unable to list Cloudflare Pages projects: ${result.stderr.toString().trim()}`);
  }

  const projects = JSON.parse(result.stdout.toString()) as Array<{ "Project Name"?: string; name?: string }>;
  if (includesPagesProject(projects, pagesName)) {
    return;
  }

  await $`${bunExec} x wrangler pages project create ${pagesName} --production-branch ${productionBranch} --cwd pages`;
}

async function deployPagesClient(pagesName: string, workerName: string, preview: boolean, clientAlreadyBuilt = false) {
  const productionBranch = renv("PAGES_PRODUCTION_BRANCH", "main");
  const branch = preview ? renv("PAGES_PREVIEW_BRANCH", "preview") : productionBranch;

  if (!clientAlreadyBuilt) await buildClient();
  await Bun.write(PAGES_CONFIG_PATH, buildPagesWranglerConfig(pagesName, workerName));
  await ensurePagesProject(pagesName, productionBranch);
  await $`${bunExec} x wrangler pages deploy --cwd pages --branch ${branch}`;
}

type R2BucketInfo = {
  name: string;
  endpoint: string;
  accessHost: string;
};

export function buildR2BucketInfo(r2BucketName: string, accountId: string): R2BucketInfo {
  return {
    name: r2BucketName,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    accessHost: `https://${r2BucketName}.${accountId}.r2.dev`,
  };
}

export function buildWranglerTriggersConfig(preview = false) {
  return preview
    ? ""
    : stripIndent(`
        [triggers]
        crons = ["*/20 * * * *"]
      `);
}

export function buildWranglerQueueConfig(taskQueueName: string, preview = false) {
  return stripIndent(`
    [[queues.producers]]
    binding = "TASK_QUEUE"
    queue = ${toml(taskQueueName)}

    [[queues.consumers]]
    queue = ${toml(taskQueueName)}
    max_batch_size = 1
    max_batch_timeout = 5
  `);
}

export function buildWranglerObservabilityConfig(preview = false) {
  if (!preview) {
    return "";
  }

  return stripIndent(`
    [observability]

    [observability.logs]
    enabled = true
    invocation_logs = true

    [observability.traces]
    enabled = false
  `);
}

async function resolveR2BucketInfo(r2BucketName: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) return null;
  if (!r2BucketName) {
    return null;
  }
  return buildR2BucketInfo(r2BucketName, accountId);
}

export async function runCloudflareDeploy(target: "all" | "server" | "client" = "all", preview = false) {
  const workerName = requireCloudflareResourceName(renv("WORKER_NAME", "rin-server"), "WORKER_NAME");
  const pagesName = requireCloudflareResourceName(
    renv("PAGES_PROJECT_NAME", env("PAGES_NAME", "rin-client")),
    "PAGES_PROJECT_NAME",
  );

  if (target === "client") {
    await deployPagesClient(pagesName, workerName, preview);
    return;
  }

  if (target === "all") {
    await buildClient();
  }

  const dbName = requireCloudflareResourceName(renv("DB_NAME", "rin"), "DB_NAME");
  const taskQueueName = requireCloudflareResourceName(
    env("TASK_QUEUE_NAME", env("AI_SUMMARY_QUEUE_NAME", `${workerName}-tasks`)) ?? `${workerName}-tasks`,
    "TASK_QUEUE_NAME",
  );
  const r2BucketName = requireR2BucketName(
    renv("R2_BUCKET_NAME", buildDefaultR2BucketName(workerName)),
  );
  const s3Endpoint = env("S3_ENDPOINT", "");
  const s3AccessHost = env("S3_ACCESS_HOST", "");
  const s3Bucket = env("S3_BUCKET", "");
  const s3CacheFolder = renv("S3_CACHE_FOLDER", "cache/");
  const s3Folder = renv("S3_FOLDER", "images/");
  const s3Region = renv("S3_REGION", "auto");
  const s3ForcePathStyle = env("S3_FORCE_PATH_STYLE", "false");
  const webhookUrl = env("WEBHOOK_URL", "");
  const rssTitle = env("RSS_TITLE", "");
  const rssDescription = env("RSS_DESCRIPTION", "");
  const cacheStorageMode = env("CACHE_STORAGE_MODE", "s3");
  const name = env("NAME", "Rin");
  const description = env("DESCRIPTION", "A lightweight personal blogging system");
  const avatar = env("AVATAR", "");
  const pageSize = env("PAGE_SIZE", "5");
  const rssEnable = env("RSS_ENABLE", "false");
  const siteUrl = env("SITE_URL", "");
  const corsAllowedOrigins = env("CORS_ALLOWED_ORIGINS", "");
  const visitRetentionDays = env("VISIT_RETENTION_DAYS", "30");

  let finalS3Endpoint = s3Endpoint;
  let finalS3Bucket = s3Bucket;
  let finalS3AccessHost = s3AccessHost;

  if (!finalS3Endpoint || !finalS3Bucket) {
    const r2Info = await resolveR2BucketInfo(r2BucketName || "");
    if (r2Info) {
      finalS3Endpoint ||= r2Info.endpoint;
      finalS3Bucket ||= r2Info.name;
    }
  }

  const serverMain = "server/src/_worker.ts";

  await Bun.write(
    WORKER_CONFIG_PATH,
    stripIndent(`
      #:schema node_modules/wrangler/config-schema.json
      name = ${toml(workerName)}
      main = ${toml(serverMain)}
      compatibility_date = "2026-01-20"

      ${buildWranglerTriggersConfig(preview)}
      ${buildWranglerObservabilityConfig(preview)}

      [vars]
      S3_FOLDER = ${toml(s3Folder)}
      S3_CACHE_FOLDER = ${toml(s3CacheFolder)}
      S3_REGION = ${toml(s3Region)}
      S3_ENDPOINT = ${toml(finalS3Endpoint)}
      S3_ACCESS_HOST = ${toml(finalS3AccessHost)}
      S3_BUCKET = ${toml(finalS3Bucket)}
      S3_FORCE_PATH_STYLE = ${toml(s3ForcePathStyle)}
      WEBHOOK_URL = ${toml(webhookUrl)}
      RSS_TITLE = ${toml(rssTitle)}
      RSS_DESCRIPTION = ${toml(rssDescription)}
      CACHE_STORAGE_MODE = ${toml(cacheStorageMode)}
      NAME = ${toml(name)}
      DESCRIPTION = ${toml(description)}
      AVATAR = ${toml(avatar)}
      PAGE_SIZE = ${toml(pageSize)}
      RSS_ENABLE = ${toml(rssEnable)}
      SITE_URL = ${toml(siteUrl)}
      CORS_ALLOWED_ORIGINS = ${toml(corsAllowedOrigins)}
      VISIT_RETENTION_DAYS = ${toml(visitRetentionDays)}

      [placement]
      mode = "smart"
    `),
  );

  const { exitCode, stderr, stdout } = await $`${bunExec} x wrangler d1 create ${dbName}`.quiet().nothrow();
  if (exitCode !== 0 && !stderr.toString().includes("already exists")) {
    console.error(`Failed to create D1 "${dbName}"`);
    console.error(stripIndent(stdout.toString()));
    console.error(stripIndent(stderr.toString()));
    process.exit(1);
  }

  const queueCreate = await $`${bunExec} x wrangler queues create ${taskQueueName}`.quiet().nothrow();
  if (queueCreate.exitCode !== 0 && !isQueueAlreadyPresentError(queueCreate.stderr.toString())) {
    console.error(`Failed to create Queue "${taskQueueName}"`);
    console.error(stripIndent(queueCreate.stdout.toString()));
    console.error(stripIndent(queueCreate.stderr.toString()));
    process.exit(1);
  }

  const bucketCreate = await $`${bunExec} x wrangler r2 bucket create ${r2BucketName}`.quiet().nothrow();
  if (bucketCreate.exitCode !== 0 && !isResourceAlreadyPresentError(bucketCreate.stderr.toString())) {
    console.error(`Failed to create R2 bucket "${r2BucketName}"`);
    console.error(stripIndent(bucketCreate.stdout.toString()));
    console.error(stripIndent(bucketCreate.stderr.toString()));
    process.exit(1);
  }

  const listJson = (JSON.parse(await $`${bunExec} x wrangler d1 list --json`.quiet().text()) as Array<{ name: string; uuid: string }>).find(
    (item) => item.name === dbName,
  );
  if (listJson) {
    await appendFile(WORKER_CONFIG_PATH, stripIndent(`
      [[d1_databases]]
      binding = "DB"
      database_name = ${toml(listJson.name)}
      database_id = ${toml(listJson.uuid)}
    `));
  }

  await appendFile(WORKER_CONFIG_PATH, stripIndent(`
    [ai]
    binding = "AI"
  `));

  await appendFile(WORKER_CONFIG_PATH, buildWranglerQueueConfig(taskQueueName, preview));

  await appendFile(WORKER_CONFIG_PATH, stripIndent(`
    [[r2_buckets]]
    binding = "R2_BUCKET"
    bucket_name = ${toml(r2BucketName)}
    preview_bucket_name = ${toml(r2BucketName)}
  `));

  const migrationVersion = await getMigrationVersion("remote", dbName);
  const infoExists = await isInfoExist("remote", dbName);
  const files = await readdir("./server/sql", { recursive: false });
  const sqlFiles = files
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => {
      const version = getMigrationFileVersion(name);
      return version !== null && version > migrationVersion;
    })
    .sort((left, right) => {
      return (getMigrationFileVersion(left) || 0) - (getMigrationFileVersion(right) || 0);
    });

  if (sqlFiles.length > 0) {
    await mkdir("backups", { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `backups/${dbName}-${timestamp}.sql`;
    await $`${bunExec} x wrangler d1 export ${dbName} --remote --output ${backupFile}`;
    console.log(`Backed up D1 to ${backupFile}`);
  }

  for (const file of sqlFiles) {
    await $`${bunExec} x wrangler d1 execute ${dbName} --remote --file ./server/sql/${file} -y`;
    console.log(`Migrated ${file}`);
    const version = getMigrationFileVersion(file);
    if (version !== null) await updateMigrationVersion("remote", dbName, version);
  }
  await fixTopField("remote", dbName, infoExists);

  if (target === "server") {
    await $`${bunExec} x wrangler deploy`;
    await syncWorkerSecrets(workerName);
    return;
  }

  await $`${bunExec} x wrangler deploy`;
  await syncWorkerSecrets(workerName);
  await deployPagesClient(pagesName, workerName, preview, true);
}
