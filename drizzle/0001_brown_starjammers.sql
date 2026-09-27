CREATE TABLE "clinic_google_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"clinic_id" text NOT NULL,
	"place_id" text,
	"rating" numeric,
	"review_count" integer,
	"reviews" jsonb,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinic_google_reviews" ADD CONSTRAINT "clinic_google_reviews_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_google_reviews_clinic_unique" ON "clinic_google_reviews" USING btree ("clinic_id");