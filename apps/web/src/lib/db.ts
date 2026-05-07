import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@runlet/db";


// Use this in All Next.js server components and pages 
// Do not use the db proxy from @runlet/db - it breaks in Next.js

export function createDb() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error("DATABASE_URL is not defined");
    }
    const client = postgres(url, { prepare: false });
    return drizzle(client, { schema });
}

export { schema };
export type AppDb = ReturnType<typeof createDb>;