ALTER TABLE "orders" ADD COLUMN "delivery_agent_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_agent_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "out_for_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_completion_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_delivery_token_hash_idx" ON "orders" ("delivery_token_hash");