import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * A PostgreSQL tool. On Windows: PG_BIN if set, then the newest "C:\Program Files\PostgreSQL\<v>\bin"
 * (installer), then ~/pgsql/bin (zip archive, no admin rights needed). Elsewhere: the PATH.
 */
export function pgBin(tool: string): string {
  if (process.platform !== "win32") return process.env.PG_BIN ? path.join(process.env.PG_BIN, tool) : tool;
  const dirs: string[] = [];
  if (process.env.PG_BIN) dirs.push(process.env.PG_BIN);
  const root = "C:\\Program Files\\PostgreSQL";
  if (existsSync(root))
    for (const v of readdirSync(root).filter((v) => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a))) dirs.push(path.join(root, v, "bin"));
  dirs.push(path.join(homedir(), "pgsql", "bin"));
  for (const d of dirs) {
    const exe = path.join(d, `${tool}.exe`);
    if (existsSync(exe)) return exe;
  }
  return tool;
}
