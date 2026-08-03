CREATE TABLE "delivery_settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"delivery_enabled" boolean DEFAULT true NOT NULL,
	"collection_enabled" boolean DEFAULT true NOT NULL,
	"delivery_restriction_mode" text DEFAULT 'none' NOT NULL,
	"base_delivery_postcode" text DEFAULT 'M13 0XX' NOT NULL,
	"delivery_radius_miles" real DEFAULT 15 NOT NULL,
	"allowed_postcode_prefixes" jsonb DEFAULT '[]' NOT NULL,
	"delivery_unavailable_message" text DEFAULT 'Delivery is currently unavailable. Collection is still available.' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_validation_result" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_distance_miles" real;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_restriction_mode" text;--> statement-breakpoint
INSERT INTO "delivery_settings" ("id", "allowed_postcode_prefixes") VALUES (
	1,
	'["M1","M2","M3","M4","M5","M6","M7","M8","M9","M11","M12","M13","M14","M15","M16","M18","M19","M20","M21","M22","M23","M24","M25","M26","M27","M28","M29","M30","M32","M33","M34","M38","M40","M41","M43","M44","M45","M46"]'::jsonb
);
