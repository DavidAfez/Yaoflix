/**
 * npm run db:import -- gabaoflix-2026-10-30.dump
 * Replaces this computer's database with an export from another one, then applies the newer
 * migrations. Needs the same .env as the computer it came from (DATA_ENC_KEY, HASH_PEPPER).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pgBin } from "./pg-bin";

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file || !existsSync(file)) {
  console.log("Usage : npm run db:import -- gabaoflix-AAAA-MM-JJ.dump");
  process.exit(1);
}
if (!url) {
  console.log("DATABASE_URL manque dans .env");
  process.exit(1);
}
if (!process.env.DATA_ENC_KEY || !process.env.HASH_PEPPER) console.log("Attention : DATA_ENC_KEY ou HASH_PEPPER est vide. Reprends le .env de l'ancien ordi, sinon personne ne pourra se connecter.\n");

// --clean drops what this computer already had (an empty or test database) before loading the export
const r = spawnSync(pgBin("pg_restore"), ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${url}`, file], { stdio: "inherit" });
if (r.status !== 0) console.log("\npg_restore a signalé des avertissements (souvent sans gravité sur une base neuve). On applique les migrations.");
const m = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "db:migrate"], { stdio: "inherit", shell: process.platform === "win32" });
if (m.status !== 0) process.exit(1);
console.log("\nBase importée. Lance : npm run go");
