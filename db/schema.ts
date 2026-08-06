import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type OrderItem = {
  id: string;
  categoryId?: number | null;
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
  discountCodeUsed: text("discount_code_used"),
  promotionName: text("promotion_name"),
  discountAmountPence: integer("discount_amount_pence"),
  subtotalBeforeDiscountPence: integer("subtotal_before_discount_pence"),
  totalAfterDiscountPence: integer("total_after_discount_pence"),
  notes: text(),
  currency: text().notNull().default("gbp"),
  amountTotal: integer("amount_total").notNull(),
  items: jsonb().$type<OrderItem[]>().notNull(),
  estimatedPrepMinutes: integer("estimated_prep_minutes"),
  deliveryAgentName: text("delivery_agent_name"),
  deliveryAgentPhone: text("delivery_agent_phone"),
  deliveryTokenHash: text("delivery_token_hash"),
  outForDeliveryAt: timestamp("out_for_delivery_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveryCompletionNote: text("delivery_completion_note"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  merchantEmailSentAt: timestamp("merchant_email_sent_at", { withTimezone: true }),
  customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("orders_delivery_token_hash_idx").on(table.deliveryTokenHash),
]);

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
  imageFocalX: integer("image_focal_x").notNull().default(50),
  imageFocalY: integer("image_focal_y").notNull().default(50),
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
  check("products_image_focal_x_range", sql`${table.imageFocalX} between 0 and 100`),
  check("products_image_focal_y_range", sql`${table.imageFocalY} between 0 and 100`),
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

export const promotions = pgTable("promotions", {
  id: serial().primaryKey(),
  promotionName: text("promotion_name").notNull(),
  promotionMessage: text("promotion_message").notNull(),
  discountCode: text("discount_code").notNull().unique(),
  discountType: text("discount_type").notNull(),
  discountValue: integer("discount_value").notNull().default(0),
  active: boolean().notNull().default(true),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  maximumUses: integer("maximum_uses"),
  maximumUsesPerCustomer: integer("maximum_uses_per_customer"),
  minimumOrderValuePence: integer("minimum_order_value_pence"),
  appliesTo: text("applies_to").notNull().default("entire_order"),
  categoryIds: jsonb("category_ids").$type<number[]>().notNull().default([]),
  productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
  showBanner: boolean("show_banner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("promotions_active_dates_idx").on(table.active, table.startDate, table.endDate),
]);

export const promotionUsage = pgTable("promotion_usage", {
  id: serial().primaryKey(),
  promotionId: integer("promotion_id").notNull().references(() => promotions.id, { onDelete: "restrict" }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerEmail: text("customer_email").notNull(),
  amountDiscountedPence: integer("amount_discounted_pence").notNull(),
  status: text().notNull().default("reserved"),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("promotion_usage_order_idx").on(table.orderId),
  index("promotion_usage_promotion_status_idx").on(table.promotionId, table.status),
  index("promotion_usage_customer_idx").on(table.promotionId, table.customerEmail),
]);
