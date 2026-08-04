ALTER TABLE "delivery_settings" ADD COLUMN "delivery_fee_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "base_delivery_fee_pence" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "included_base_miles" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "additional_mile_fee_pence" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "free_delivery_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "free_delivery_threshold_pence" integer;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "minimum_delivery_order_pence" integer;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD COLUMN "minimum_collection_order_pence" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee_pence" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_pricing_rule" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_subtotal_pence" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_total_pence" integer;