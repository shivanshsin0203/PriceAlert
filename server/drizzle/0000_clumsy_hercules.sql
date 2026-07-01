CREATE TYPE "public"."alert_status" AS ENUM('active', 'triggered', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('EUR', 'USD', 'INR');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('inapp', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"nl_input" text,
	"label" text,
	"condition" jsonb NOT NULL,
	"symbols" text[] NOT NULL,
	"channels" "delivery_channel"[] NOT NULL,
	"expires_at" timestamp with time zone,
	"eval_state" jsonb,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"price" numeric,
	"context_text" text,
	"payload" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"telegram_username" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"google_sub" text,
	"name" text,
	"avatar_url" text,
	"preferred_currency" "currency_code" DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alerts_status" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_alerts_user" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_symbols" ON "alerts" USING gin ("symbols");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_deliveries_alert_channel" ON "deliveries" USING btree ("alert_id","channel");--> statement-breakpoint
CREATE INDEX "idx_deliveries_inbox" ON "deliveries" USING btree ("user_id","fired_at");--> statement-breakpoint
CREATE INDEX "idx_deliveries_alert" ON "deliveries" USING btree ("alert_id");