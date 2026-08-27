import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull().default(""),
  brand: text("brand").notNull().default("未設定品牌"),
  name: text("name").notNull(), category: text("category").notNull(), unit: text("unit").notNull(),
  packageSize: real("package_size").notNull(), remaining: real("remaining").notNull(), lowThreshold: real("low_threshold").notNull(),
  phType: text("ph_type").notNull().default("中性"),
  active: integer("active").notNull().default(1),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
});
export const dilutionProfiles = sqliteTable("dilution_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ratio: integer("ratio").notNull(),
  defaultWater: integer("default_water").notNull().default(2000),
  createdAt: text("created_at").notNull(),
});
export const washSessions = sqliteTable("wash_sessions", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull().default(""), washedAt: text("washed_at").notNull(), note: text("note"), flowName: text("flow_name"), createdAt: text("created_at").notNull(),
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

export const washFlows = sqliteTable("wash_flows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull().default(""),
  name: text("name").notNull(),
  flowType: text("flow_type").notNull(),
  createdAt: text("created_at").notNull(),
});

export const washFlowItems = sqliteTable("wash_flow_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  flowId: integer("flow_id").notNull().references(() => washFlows.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  amount: real("amount").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});
