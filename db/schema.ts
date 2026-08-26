import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), category: text("category").notNull(), unit: text("unit").notNull(),
  packageSize: real("package_size").notNull(), remaining: real("remaining").notNull(), lowThreshold: real("low_threshold").notNull(),
  createdAt: text("created_at").notNull(),
});
export const washSessions = sqliteTable("wash_sessions", {
  id: text("id").primaryKey(), washedAt: text("washed_at").notNull(), note: text("note"), createdAt: text("created_at").notNull(),
});
export const washUsages = sqliteTable("wash_usages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  washId: text("wash_id").notNull().references(() => washSessions.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id), amount: real("amount").notNull(),
});
export const restocks = sqliteTable("restocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id), amount: real("amount").notNull(), createdAt: text("created_at").notNull(),
});
