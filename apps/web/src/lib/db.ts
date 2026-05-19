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
    // connect_timeout: fail fast (10s) instead of the 30s postgres.js default
    const client = postgres(url, { prepare: false, connect_timeout: 10 });
    return drizzle(client, { schema });
}

// Use this in API route handlers — callers must call client.end() in a finally block
export function createApiDb() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not defined");
    const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
    return { db: drizzle(client, { schema }), client };
}

export { schema };
export type AppDb = ReturnType<typeof createDb>;