CREATE TABLE "promotion_usage" (
	"id" serial PRIMARY KEY,
	"promotion_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"customer_email" text NOT NULL,
	"amount_discounted_pence" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_until" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY,
	"promotion_name" text NOT NULL,
	"promotion_message" text NOT NULL,
	"discount_code" text NOT NULL UNIQUE,
	"discount_type" text NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"maximum_uses" integer,
	"maximum_uses_per_customer" integer,
	"minimum_order_value_pence" integer,
	"applies_to" text DEFAULT 'entire_order' NOT NULL,
	"category_ids" jsonb DEFAULT '[]' NOT NULL,
	"product_ids" jsonb DEFAULT '[]' NOT NULL,
	"show_banner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code_used" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promotion_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount_pence" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal_before_discount_pence" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_after_discount_pence" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_usage_order_idx" ON "promotion_usage" ("order_id");--> statement-breakpoint
CREATE INDEX "promotion_usage_promotion_status_idx" ON "promotion_usage" ("promotion_id","status");--> statement-breakpoint
CREATE INDEX "promotion_usage_customer_idx" ON "promotion_usage" ("promotion_id","customer_email");--> statement-breakpoint
CREATE INDEX "promotions_active_dates_idx" ON "promotions" ("active","start_date","end_date");--> statement-breakpoint
ALTER TABLE "promotion_usage" ADD CONSTRAINT "promotion_usage_promotion_id_promotions_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "promotion_usage" ADD CONSTRAINT "promotion_usage_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE FUNCTION enforce_promotion_usage_limits() RETURNS trigger AS $$
DECLARE
  promotion_record promotions%ROWTYPE;
  current_uses integer;
  customer_uses integer;
BEGIN
  SELECT * INTO promotion_record FROM promotions WHERE id = NEW.promotion_id FOR UPDATE;
  SELECT count(*) INTO current_uses FROM promotion_usage
    WHERE promotion_id = NEW.promotion_id AND (status = 'used' OR (status = 'reserved' AND reserved_until > now()));
  IF promotion_record.maximum_uses IS NOT NULL AND current_uses >= promotion_record.maximum_uses THEN
    RAISE EXCEPTION 'promotion usage limit reached';
  END IF;
  IF promotion_record.maximum_uses_per_customer IS NOT NULL THEN
    SELECT count(*) INTO customer_uses FROM promotion_usage
      WHERE promotion_id = NEW.promotion_id AND customer_email = NEW.customer_email
        AND (status = 'used' OR (status = 'reserved' AND reserved_until > now()));
    IF customer_uses >= promotion_record.maximum_uses_per_customer THEN
      RAISE EXCEPTION 'promotion customer usage limit reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "promotion_usage_limits_trigger" BEFORE INSERT ON "promotion_usage"
FOR EACH ROW EXECUTE FUNCTION enforce_promotion_usage_limits();
