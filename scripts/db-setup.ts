/**
 * npm run db:setup
 * First run on a new computer: creates the personal PostgreSQL instance in ~/gabao-db (no admin
 * rights), starts it, creates the user and database named in DATABASE_URL, applies the migrations.
 * Safe to run again: every step is skipped when already done.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pgBin } from "./pg-bin";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.log("DATABASE_URL manque dans .env (copie celui de l'ancien ordi).");
  process.exit(1);
}
const url = new URL(raw);
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const port = url.port || "5432";
const dbName = url.pathname.slice(1);
const dataDir = process.env.PGDATA || path.join(homedir(), "gabao-db");
const run = (tool: string, args: string[], quiet = false) => spawnSync(pgBin(tool), args, { encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });

if (run("initdb", ["--version"], true).status !== 0) {
  console.log(`PostgreSQL n'est pas installé sur cet ordi.

Sans droits d'administrateur :
  1. Télécharge l'archive ZIP (« binaries ») pour Windows : https://www.enterprisedb.com/download-postgresql-binaries
  2. Décompresse-la pour avoir le dossier ${path.join(homedir(), "pgsql")} (avec bin dedans)
  3. Relance : npm run db:setup
Avec l'installateur classique (droits admin), c'est trouvé tout seul dans C:\\Program Files\\PostgreSQL.`);
  process.exit(1);
}

// 1. The instance itself
if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.log(`Création de la base dans ${dataDir}…`);
  const init = run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  if (init.status !== 0) process.exit(1);
  // Only this computer can reach it, on the port the .env expects
  // (Linux/macOS: no socket in the system folder, which needs admin rights; everything goes through localhost)
  appendFileSync(path.join(dataDir, "postgresql.conf"), `\nport = ${port}\nlisten_addresses = 'localhost'\n${process.platform === "win32" ? "" : "unix_socket_directories = ''\n"}`);
}

// 2. Running
if (run("pg_ctl", ["-D", dataDir, "status"], true).status !== 0) {
  const start = run("pg_ctl", ["-D", dataDir, "-l", `${dataDir}.log`, "-w", "start"]);
  if (start.status !== 0) {
    console.log(`La base n'a pas démarré. Journal : ${dataDir}.log (le port ${port} est peut-être déjà pris)`);
    process.exit(1);
  }
}

// 3. User and database from DATABASE_URL
const sql = (q: string) => run("psql", ["-h", "localhost", "-p", port, "-U", "postgres", "-d", "postgres", "-tAc", q], true);
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const probe = sql(`select 1 from pg_roles where rolname = ${lit(user)}`);
if (probe.status !== 0) {
  console.log(`Impossible de parler à la base : ${probe.stderr.trim()}`);
  process.exit(1);
}
if (probe.stdout.trim() !== "1") sql(`create role ${ident(user)} login password ${lit(password)}`);
if (sql(`select 1 from pg_database where datname = ${lit(dbName)}`).stdout.trim() !== "1") {
  const made = sql(`create database ${ident(dbName)} owner ${ident(user)}`);
  if (made.status !== 0) {
    console.log(made.stderr);
    process.exit(1);
  }
}
console.log(`Base « ${dbName} » prête sur le port ${port}.`);

// 4. Tables
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const m = spawnSync(npm, ["run", "db:migrate"], { stdio: "inherit", shell: process.platform === "win32" });
if (m.status !== 0) process.exit(1);
console.log("\nC'est prêt. Pour reprendre tes membres : npm run db:import -- gabaoflix-AAAA-MM-JJ.dump, sinon : npm run go");
