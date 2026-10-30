import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** A PostgreSQL tool: on Windows, from the newest "C:\Program Files\PostgreSQL\<version>\bin", else from the PATH. */
export function pgBin(tool: string): string {
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
