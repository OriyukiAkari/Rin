const extensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".mts",
  ".sh", ".sql", ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);

const tracked = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { stdout: "pipe", stderr: "inherit" });
if (tracked.exitCode !== 0) process.exit(tracked.exitCode);

const files = tracked.stdout.toString().split("\0").filter(Boolean);
const failures: string[] = [];

for (const file of files) {
  const extension = file.slice(file.lastIndexOf("."));
  if (!extensions.has(extension)) continue;
  const source = Bun.file(file);
  if (!(await source.exists())) continue;
  const data = await source.arrayBuffer();
  const bytes = new Uint8Array(data);
  if (bytes.includes(0)) {
    failures.push(`${file}: contains NUL bytes`);
    continue;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/^(?:<{7}|={7}|>{7})(?: .*)?$/m.test(text)) failures.push(`${file}: contains merge-conflict markers`);
  if (extension === ".json" && !file.endsWith("tsconfig.json")) {
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`${file}: invalid JSON (${error instanceof Error ? error.message : error})`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Repository hygiene check passed (${files.length} tracked files inspected)`);
