CREATE INDEX "games_finished_at_idx" ON "games" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "user_profiles_user_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "virtual_bets_game_status_idx" ON "virtual_bets" USING btree ("game_id","status");