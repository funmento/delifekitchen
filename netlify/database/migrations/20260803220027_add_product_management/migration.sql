CREATE TABLE "categories" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_groups" (
	"id" serial PRIMARY KEY,
	"product_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_options" (
	"id" serial PRIMARY KEY,
	"group_id" integer NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"price_adjustment" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"full_description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "categories_active_sort_idx" ON "categories" ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_groups_product_key_idx" ON "product_option_groups" ("product_id","key");--> statement-breakpoint
CREATE INDEX "product_option_groups_product_sort_idx" ON "product_option_groups" ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_group_key_idx" ON "product_options" ("group_id","key");--> statement-breakpoint
CREATE INDEX "product_options_group_active_sort_idx" ON "product_options" ("group_id","active","sort_order");--> statement-breakpoint
CREATE INDEX "products_category_sort_idx" ON "products" ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "products_active_sold_out_idx" ON "products" ("active","sold_out");--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_group_id_product_option_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_option_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL;