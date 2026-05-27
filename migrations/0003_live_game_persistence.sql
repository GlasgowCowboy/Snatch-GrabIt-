ALTER TABLE "games" ADD COLUMN "live_state" json;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "live_state_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "games_active_idx" ON "games" USING btree ("started_at","finished_at");