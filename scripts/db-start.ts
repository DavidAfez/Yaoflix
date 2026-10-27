/**
 * npm run db:start
 * Starts the personal PostgreSQL instance created with initdb in ~/gabao-db (port set in its postgresql.conf).
 * No admin rights needed. Safe to run when it is already up.
 */
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dataDir = process.env.PGDATA || path.join(homedir(), "gabao-db");

function pgBin(tool: string): string {
  if (process.platform === "win32") {
    const root = "C:\\Program Files\\PostgreSQL";
    if (existsSync(root)) {
      const versions = readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a));
      for (const v of versions) {
        const exe = path.join(root, v, "bin", `${tool}.exe`);
        if (existsSync(exe)) return exe;
      }
    }
  }
  return tool;
}

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.error(`Aucune base trouvée dans ${dataDir}. Crée-la d'abord avec initdb.`);
  process.exit(1);
}

const status = spawnSync(pgBin("pg_ctl"), ["-D", dataDir, "status"], { encoding: "utf8" });
if (status.status === 0) {
  console.log("La base tourne déjà.");
  process.exit(0);
}

const start = spawnSync(pgBin("pg_ctl"), ["-D", dataDir, "-l", `${dataDir}.log`, "-w", "start"], { stdio: "inherit" });
if (start.status === 0) console.log("Base démarrée. Garde cette fenêtre ouverte tant que tu utilises le site.");
else console.error(`Échec du démarrage. Regarde le journal : ${dataDir}.log`);
process.exit(start.status ?? 1);
