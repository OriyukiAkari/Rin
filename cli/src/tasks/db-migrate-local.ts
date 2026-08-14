import * as fs from "node:fs";
import * as path from "node:path";
import { fixTopField, getMigrationFileVersion, getMigrationVersion, isInfoExist, updateMigrationVersion } from "../lib/db-migration";

const bunExec = process.execPath;

export async function runLocalDbMigrate(dbName = "rin") {
  const sqlDir = path.join(process.cwd(), "server", "sql");

  const type = "local";
  const migrationVersion = await getMigrationVersion(type, dbName);
  const infoExists = await isInfoExist(type, dbName);
  const sqlFiles = fs
    .readdirSync(sqlDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .filter((file) => {
      const version = getMigrationFileVersion(file);
      return version !== null && version > migrationVersion;
    })
    .sort((left, right) => {
      return (getMigrationFileVersion(left) || 0) - (getMigrationFileVersion(right) || 0);
    });

  console.log("migration_version:", migrationVersion, "Migration SQL List: ", sqlFiles);

  for (const file of sqlFiles) {
    const filePath = path.join(sqlDir, file);
    const child = Bun.spawn([bunExec, "x", "wrangler", "d1", "execute", dbName, "--local", "--file", filePath], {
      cwd: process.cwd(),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`Failed to execute ${file}`);
    console.log(`Executed ${file}`);
    const version = getMigrationFileVersion(file);
    if (version !== null) await updateMigrationVersion(type, dbName, version);
  }

  if (sqlFiles.length === 0) {
    console.log("No migration needed.");
  }

  await fixTopField(type, dbName, infoExists);
}
