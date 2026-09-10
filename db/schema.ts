import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const familyState = sqliteTable("family_state", {
  ownerId: text("owner_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const familyAccessAttempts = sqliteTable("family_access_attempts", {
  clientKey: text("client_key").primaryKey(),
  failedCount: integer("failed_count").notNull(),
  windowStarted: integer("window_started").notNull(),
});
