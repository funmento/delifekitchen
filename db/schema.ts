import { boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type OrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  customizations: Array<{
    groupId: string;
    groupName: string;
    selections: Array<{
      id: string;
      name: string;
      priceAdjustment: number;
    }>;
  }>;
};

export const orders = pgTable("orders", {
  id: serial().primaryKey(),
  reference: text().notNull().unique(),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text().notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  fulfilment: text().notNull(),
  deliveryAddress: text("delivery_address"),
  postcode: text(),
  deliveryValidationResult: text("delivery_validation_result"),
  deliveryDistanceMiles: real("delivery_distance_miles"),
  deliveryRestrictionMode: text("delivery_restriction_mode"),
  deliveryFeePence: integer("delivery_fee_pence"),
  deliveryPricingRule: text("delivery_pricing_rule"),
  orderSubtotalPence: integer("order_subtotal_pence"),
  orderTotalPence: integer("order_total_pence"),
  notes: text(),
  currency: text().notNull().default("gbp"),
  amountTotal: integer("amount_total").notNull(),
  items: jsonb().$type<OrderItem[]>().notNull(),
  estimatedPrepMinutes: integer("estimated_prep_minutes"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  merchantEmailSentAt: timestamp("merchant_email_sent_at", { withTimezone: true }),
  customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderEmailDeliveries = pgTable("order_email_deliveries", {
  id: serial().primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  statusKey: text("status_key").notNull(),
  recipient: text().notNull(),
  state: text().notNull().default("pending"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("order_email_deliveries_order_kind_status_idx").on(table.orderId, table.kind, table.statusKey),
]);

export const deliverySettings = pgTable("delivery_settings", {
  id: integer().primaryKey().default(1),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
  collectionEnabled: boolean("collection_enabled").notNull().default(true),
  deliveryRestrictionMode: text("delivery_restriction_mode").notNull().default("none"),
  baseDeliveryPostcode: text("base_delivery_postcode").notNull().default("M13 0XX"),
  deliveryRadiusMiles: real("delivery_radius_miles").notNull().default(15),
  allowedPostcodePrefixes: jsonb("allowed_postcode_prefixes").$type<string[]>().notNull().default([]),
  deliveryUnavailableMessage: text("delivery_unavailable_message").notNull().default("Delivery is currently unavailable. Collection is still available."),
  deliveryFeeEnabled: boolean("delivery_fee_enabled").notNull().default(true),
  baseDeliveryFeePence: integer("base_delivery_fee_pence").notNull().default(300),
  includedBaseMiles: real("included_base_miles").notNull().default(1),
  additionalMileFeePence: integer("additional_mile_fee_pence").notNull().default(150),
  freeDeliveryEnabled: boolean("free_delivery_enabled").notNull().default(false),
  freeDeliveryThresholdPence: integer("free_delivery_threshold_pence"),
  minimumDeliveryOrderPence: integer("minimum_delivery_order_pence"),
  minimumCollectionOrderPence: integer("minimum_collection_order_pence"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: serial().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text().notNull().default(""),
  active: boolean().notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("categories_active_sort_idx").on(table.active, table.sortOrder),
]);

export const products = pgTable("products", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  shortDescription: text("short_description").notNull().default(""),
  fullDescription: text("full_description").notNull().default(""),
  price: integer().notNull(),
  imageUrl: text("image_url").notNull().default(""),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  active: boolean().notNull().default(true),
  soldOut: boolean("sold_out").notNull().default(false),
  featured: boolean().notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("products_category_sort_idx").on(table.categoryId, table.sortOrder),
  index("products_active_sold_out_idx").on(table.active, table.soldOut),
]);

export const productOptionGroups = pgTable("product_option_groups", {
  id: serial().primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  key: text().notNull(),
  name: text().notNull(),
  required: boolean().notNull().default(false),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("product_option_groups_product_key_idx").on(table.productId, table.key),
  index("product_option_groups_product_sort_idx").on(table.productId, table.sortOrder),
]);

export const productOptions = pgTable("product_options", {
  id: serial().primaryKey(),
  groupId: integer("group_id").notNull().references(() => productOptionGroups.id, { onDelete: "cascade" }),
  key: text().notNull(),
  name: text().notNull(),
  priceAdjustment: integer("price_adjustment").notNull().default(0),
  active: boolean().notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("product_options_group_key_idx").on(table.groupId, table.key),
  index("product_options_group_active_sort_idx").on(table.groupId, table.active, table.sortOrder),
]);
