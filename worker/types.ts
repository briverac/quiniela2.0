import type { InferSelectModel } from "drizzle-orm";
import type { users } from "./db/schema";
import type { Db } from "./db/drizzle";

export type Env = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  /** Comma-separated admin emails (matched on login) */
  ADMIN_EMAILS?: string;
};

export type UserRow = InferSelectModel<typeof users>;

export type HonoEnv = {
  Bindings: Env;
  Variables: {
    user: UserRow | null;
    db: Db;
  };
};
