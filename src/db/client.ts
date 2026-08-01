import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

let database: NeonHttpDatabase<typeof schema> | undefined;

export function getDatabase(): NeonHttpDatabase<typeof schema> {
  if (database) {
    return database;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Database configuration is unavailable.");
  }

  database = drizzle(neon(databaseUrl), { schema });

  return database;
}
