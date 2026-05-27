import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session table — matches the schema `connect-pg-simple` auto-creates. We model
// it explicitly so it's covered by migrations rather than ad-hoc table creation
// on boot. Naive timestamp matches the library's expectation.
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { withTimezone: false, mode: 'date', precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

// User accounts table
export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    tier: text("tier").notNull().default('free'), // 'free' or 'paid'
    isAdmin: boolean("is_admin").notNull().default(false), // Admin access for system configuration
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    usernameIdx: index("users_username_idx").on(table.username),
    // Functional index — getUserByEmail does a case-insensitive lookup
    // (`lower(email) = lower(?)`), which can't use a plain btree on email.
    emailLowerIdx: index("users_email_lower_idx").on(sql`lower(${table.email})`),
  }),
);

// Email verification tokens — single-use, expire after 24h.
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("email_verification_tokens_user_idx").on(table.userId),
    expiresIdx: index("email_verification_tokens_expires_idx").on(table.expiresAt),
  }),
);

// User profiles table
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    cardBackUrl: text("card_back_url"), // Custom card back image URL
    tableTheme: text("table_theme").notNull().default('green'), // 'green', 'light', 'dark', 'normal'
    bonePilePosition: text("bone_pile_position").notNull().default('left'), // 'left' or 'right' - position of bone pile relative to tableau
    bio: text("bio"),
    virtualChips: integer("virtual_chips").notNull().default(1000), // Daily-reset chips used for betting.
    lastChipReset: timestamp("last_chip_reset", { withTimezone: true }).notNull().defaultNow(), // Track daily chip resets
    earnedCredits: integer("earned_credits").notNull().default(0), // Persistent credits earned via gameplay (and future Stripe purchases).
  },
  (table) => ({
    // Hot path — every chip/credit op and leaderboard join keys on user_id.
    userIdx: index("user_profiles_user_idx").on(table.userId),
  }),
);

// Game history table
export const games = pgTable(
  "games",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Nullable: row is created at room creation so virtual_bets can FK to it,
    // then started_at/finished_at are populated as the game's lifecycle progresses.
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    winnerId: varchar("winner_id"),
    scoringMethod: text("scoring_method").notNull(), // 'fullHand' or 'round'
    targetScore: integer("target_score").notNull(),
    // Live game state, JSON. Written debounced (~1/s per room) by the WS
    // server so a crash / redeploy can restore in-flight games on boot.
    // Cleared (set to NULL) when the game finishes — finished games live in
    // game_participants going forward, not here.
    liveState: json("live_state"),
    liveStateUpdatedAt: timestamp("live_state_updated_at", { withTimezone: true }),
  },
  (table) => ({
    // History list orders by finished_at desc — index keeps it cheap as the
    // games table grows.
    finishedAtIdx: index("games_finished_at_idx").on(table.finishedAt),
    // Boot-restore scans for "started but not yet finished" games with a
    // live_state present. Composite to avoid a full-table scan.
    activeIdx: index("games_active_idx").on(table.startedAt, table.finishedAt),
  }),
);

// Game participants table (many-to-many relationship)
export const gameParticipants = pgTable(
  "game_participants",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: varchar("game_id").notNull().references(() => games.id),
    userId: varchar("user_id").references(() => users.id), // Nullable for guest players
    playerName: text("player_name").notNull(),
    score: integer("score").notNull().default(0),
    placement: integer("placement"), // 1st, 2nd, 3rd, etc.
    declaredOut: boolean("declared_out").notNull().default(false),
  },
  (table) => ({
    // Hot query: "all games for user X" hits userId.
    userIdx: index("game_participants_user_idx").on(table.userId),
    // Hot query: "all participants for game G" hits gameId.
    gameIdx: index("game_participants_game_idx").on(table.gameId),
  }),
);

// Virtual bets table (for entertainment only - no real-world value)
export const virtualBets = pgTable(
  "virtual_bets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    gameId: varchar("game_id").notNull().references(() => games.id),
    bettorUserId: varchar("bettor_user_id").references(() => users.id), // Nullable for guest players
    bettorName: text("bettor_name").notNull(),
    betType: text("bet_type").notNull(), // 'winner', 'declareOut', 'confidence', 'sidebet'
    targetUserId: varchar("target_user_id").references(() => users.id), // Who they're betting on (if applicable)
    targetPlayerName: text("target_player_name"), // Name of player being bet on
    chipAmount: integer("chip_amount").notNull(),
    payout: integer("payout").notNull().default(0), // Chips won/lost
    status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'void'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Hot queries: settlement walks bets per game; user history walks bets per user.
    gameIdx: index("virtual_bets_game_idx").on(table.gameId),
    bettorIdx: index("virtual_bets_bettor_idx").on(table.bettorUserId),
    // Settlement filters `status = 'pending'` after fetching by gameId; a
    // composite keeps settleGameBets cheap even if a single game accrues many
    // historical (won/lost) bets.
    gameStatusIdx: index("virtual_bets_game_status_idx").on(table.gameId, table.status),
  }),
);

// Password reset tokens table
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("password_reset_tokens_user_idx").on(table.userId),
    expiresIdx: index("password_reset_tokens_expires_idx").on(table.expiresAt),
  }),
);

// Admin settings table (singleton - one row only)
export const adminSettings = pgTable("admin_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // AI Difficulty Settings (per difficulty level)
  easyMoveDelayMin: integer("easy_move_delay_min").notNull().default(1500),
  easyMoveDelayMax: integer("easy_move_delay_max").notNull().default(3000),
  easyIntelligence: integer("easy_intelligence").notNull().default(50), // 0-100: % of time AI makes optimal move
  mediumMoveDelayMin: integer("medium_move_delay_min").notNull().default(800),
  mediumMoveDelayMax: integer("medium_move_delay_max").notNull().default(1500),
  mediumIntelligence: integer("medium_intelligence").notNull().default(75),
  hardMoveDelayMin: integer("hard_move_delay_min").notNull().default(400),
  hardMoveDelayMax: integer("hard_move_delay_max").notNull().default(800),
  hardIntelligence: integer("hard_intelligence").notNull().default(95),
  // Sponsorship Settings
  sponsorLogoUrl: text("sponsor_logo_url"),
  sponsorText: text("sponsor_text"),
  sponsorLink: text("sponsor_link"),
  sponsorEnabled: boolean("sponsor_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Password validation schema with requirements
export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[0-9]/, "Password must contain at least 1 number")
  .regex(/[A-Z]/, "Password must contain at least 1 capital letter")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least 1 special character");

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
}).extend({
  password: passwordSchema,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  startedAt: true,
});

export const insertGameParticipantSchema = createInsertSchema(gameParticipants).omit({
  id: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).omit({
  id: true,
  createdAt: true,
});

export const insertVirtualBetSchema = createInsertSchema(virtualBets).omit({
  id: true,
  createdAt: true,
});

export const insertAdminSettingsSchema = createInsertSchema(adminSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGameParticipant = z.infer<typeof insertGameParticipantSchema>;
export type GameParticipant = typeof gameParticipants.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertVirtualBet = z.infer<typeof insertVirtualBetSchema>;
export type VirtualBet = typeof virtualBets.$inferSelect;
export type InsertAdminSettings = z.infer<typeof insertAdminSettingsSchema>;
export type AdminSettings = typeof adminSettings.$inferSelect;

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
  playedBy?: string; // Player ID who played this card to foundation
}

export interface PlayerState {
  id: string;
  name: string;
  tableau: Card[][];
  bonePile: Card[];
  drawPile: Card[];
  currentDraw: Card[];
  cardBackImage?: string;
  isAI?: boolean; // Engine-visible flag (AI players are auto-scheduled in gameSocket.ts)
  score: number; // Running total score
  roundScore?: number; // Score for current round
}

export interface FoundationPile {
  suit: Suit;
  cards: Card[];
}

export type ScoringMethod = 'fullHand' | 'round';

export interface ScoringSettings {
  method: ScoringMethod;
  targetScore: number; // 50/100/150 for fullHand, 3/5 for round
}

export interface RoundResult {
  playerId: string;
  playerName: string;
  foundationCards: number; // Cards played to foundation
  bonePileRemaining: number;
  tableauRemaining: number;
  declaredOut: boolean; // Did they declare out?
  roundScore: number;
  totalScore: number;
  /** Persistent credits earned this game (only present on the final game-over state, only for authenticated players). */
  creditsEarned?: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
}

export interface GameState {
  id: string;
  players: PlayerState[];
  foundations: FoundationPile[];
  scoringSettings: ScoringSettings;
  status: 'playing' | 'roundEnded' | 'gameOver';
  roundResults?: RoundResult[];
  winnerId?: string; // Player who won the game (reached target score)
  declaredOutId?: string; // Player who declared out this round
  chatMessages?: ChatMessage[];
}
