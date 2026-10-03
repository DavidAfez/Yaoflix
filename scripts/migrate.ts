import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied");
process.exit(0);
