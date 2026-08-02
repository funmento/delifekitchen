CREATE TABLE "order_email_deliveries" (
	"id" serial PRIMARY KEY,
	"order_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status_key" text NOT NULL,
	"recipient" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "estimated_prep_minutes" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "order_email_deliveries_order_kind_status_idx" ON "order_email_deliveries" ("order_id","kind","status_key");--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;