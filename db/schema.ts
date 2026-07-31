import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
  notes: text(),
  currency: text().notNull().default("gbp"),
  amountTotal: integer("amount_total").notNull(),
  items: jsonb().$type<OrderItem[]>().notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  merchantEmailSentAt: timestamp("merchant_email_sent_at", { withTimezone: true }),
  customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
