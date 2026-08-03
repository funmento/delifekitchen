import { boolean, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
