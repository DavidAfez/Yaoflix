/**
 * npm run db:export
 * Saves the whole database (members, requests, posts, chat ciphertext...) into one file, to move
 * the site to another computer. Bring the .env and the storage folder along with it.
 */
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { pgBin } from "./pg-bin";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL manque dans .env");
  process.exit(1);
}
const file = `gabaoflix-${new Date().toISOString().slice(0, 10)}.dump`;
const r = spawnSync(pgBin("pg_dump"), ["--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, url], { stdio: "inherit" });
if (r.status !== 0) {
  console.log("\nExport impossible. La base tourne ? Lance d'abord : npm run db:start");
  process.exit(1);
}
console.log(`\nBase exportée : ${file} (${(statSync(file).size / 1024 / 1024).toFixed(1)} Mo)`);
console.log("Copie sur le nouvel ordi : ce fichier, le fichier .env (les mêmes clés, sinon les emails sont illisibles) et le dossier storage.");
