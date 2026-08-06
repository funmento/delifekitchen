ALTER TABLE "products" ADD COLUMN "image_focal_x" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_focal_y" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_focal_x_range" CHECK ("image_focal_x" between 0 and 100);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_focal_y_range" CHECK ("image_focal_y" between 0 and 100);