// From blueprint: javascript_auth_all_persistance
import { type User, type InsertUser, type UserProfile, type InsertUserProfile, type Game, type InsertGame, type GameParticipant, type InsertGameParticipant, type PasswordResetToken, type InsertPasswordResetToken, type EmailVerificationToken, type InsertEmailVerificationToken, type VirtualBet, type InsertVirtualBet, type AdminSettings, type InsertAdminSettings } from "@shared/schema";
import { users, userProfiles, games, gameParticipants, passwordResetTokens, emailVerificationTokens, virtualBets, adminSettings } from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { pool } from "./db";
import { eq, sql, desc, count, avg } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

/** Daily refill amount for play-money chips (resets every 24h). */
export const DAILY_CHIP_RESET_AMOUNT = 1000;
/** How often a user's daily chip balance is restored. */
export const DAILY_CHIP_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Mirror of the credit constants in gameSocket.ts — used when computing history summaries. */
const PLACEMENT_CREDITS: Record<number, number> = { 1: 100, 2: 25, 3: 10 };
const DECLARE_OUT_BONUS = 25;
function placementToCredits(placement: number | null, declaredOut: boolean): number {
  if (!placement) return 0;
  return (PLACEMENT_CREDITS[placement] ?? 0) + (declaredOut ? DECLARE_OUT_BONUS : 0);
}

/** Shaped return type for a user's game history list. */
export interface UserGameSummary {
  gameId: string;
  scoringMethod: string;
  targetScore: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  placement: number | null;
  score: number | null;
  playerName: string;
  declaredOut: boolean;
  totalPlayers: number;
  earnedCredits: number; // credits granted for this game (derived from placement)
}

/** One row in the global leaderboard. */
export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  wins: number;
  winPct: number;      // 0–100
  avgPlacement: number; // lower is better
  earnedCredits: number;
}

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser, displayName?: string): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User>;
  updateUserTier(userId: string, tier: string): Promise<User>;

  // Profile management
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile>;

  // Game history (only for paid users)
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, updates: { winnerId?: string | null; startedAt?: Date | null; finishedAt?: Date | null }): Promise<Game>;
  addGameParticipant(participant: InsertGameParticipant): Promise<GameParticipant>;
  getGameParticipants(gameId: string): Promise<GameParticipant[]>;
  getUserGames(userId: string): Promise<UserGameSummary[]>;
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Write-through persistence of the live game state for crash recovery. */
  persistLiveState(gameId: string, state: unknown): Promise<void>;
  /** Drop the live_state blob (called when a game finishes or is abandoned). */
  clearLiveState(gameId: string): Promise<void>;
  /** All games that have started but not finished and still have a live_state blob. */
  listActiveGameStates(): Promise<Array<{ gameId: string; liveState: unknown; updatedAt: Date | null }>>;

  // Password reset
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<User>;

  // Email verification
  createEmailVerificationToken(token: InsertEmailVerificationToken): Promise<EmailVerificationToken>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationToken(token: string): Promise<void>;
  markEmailVerified(userId: string): Promise<User>;

  // Virtual betting (entertainment only - no real-world value)
  getUserChipBalance(userId: string): Promise<number>;
  resetDailyChips(userId: string): Promise<UserProfile>;
  /** Atomically increment a user's persistent earned_credits. */
  grantCredits(userId: string, amount: number): Promise<UserProfile>;
  placeBet(bet: InsertVirtualBet): Promise<VirtualBet>;
  updateBetStatus(betId: string, status: 'won' | 'lost' | 'void', payout: number): Promise<VirtualBet>;
  getUserBets(userId: string, limit?: number): Promise<VirtualBet[]>;
  getGameBets(gameId: string): Promise<VirtualBet[]>;
  updateUserChips(userId: string, chipAmount: number): Promise<UserProfile>;
  getChipLeaderboard(limit?: number): Promise<{ userId: string; displayName: string; chips: number }[]>;

  // Admin settings
  getAdminSettings(): Promise<AdminSettings>;
  updateAdminSettings(updates: Partial<InsertAdminSettings>): Promise<AdminSettings>;

  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ pool, createTableIfMissing: true });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Case-insensitive match — email addresses are not case-sensitive.
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`);
    return user || undefined;
  }

  async createUser(insertUser: InsertUser, displayName?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        tier: 'free',
      })
      .returning();

    await db.insert(userProfiles).values({
      userId: user.id,
      displayName: displayName || user.username,
      tableTheme: 'green',
    });

    return user;
  }

  async updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ stripeCustomerId, stripeSubscriptionId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserTier(userId: string, tier: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ tier })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db.insert(userProfiles).values(profile).returning();
    return newProfile;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
    const [profile] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async updateGame(id: string, updates: { winnerId?: string | null; startedAt?: Date | null; finishedAt?: Date | null }): Promise<Game> {
    const [updated] = await db.update(games).set(updates).where(eq(games.id, id)).returning();
    return updated;
  }

  async addGameParticipant(participant: InsertGameParticipant): Promise<GameParticipant> {
    const [newParticipant] = await db.insert(gameParticipants).values(participant).returning();
    return newParticipant;
  }

  async persistLiveState(gameId: string, state: unknown): Promise<void> {
    await db
      .update(games)
      .set({ liveState: state as any, liveStateUpdatedAt: new Date() })
      .where(eq(games.id, gameId));
  }

  async clearLiveState(gameId: string): Promise<void> {
    await db
      .update(games)
      .set({ liveState: null, liveStateUpdatedAt: null })
      .where(eq(games.id, gameId));
  }

  async listActiveGameStates(): Promise<Array<{ gameId: string; liveState: unknown; updatedAt: Date | null }>> {
    // "Active" = started, not finished, has a saved snapshot.
    const rows = await db
      .select({
        gameId: games.id,
        liveState: games.liveState,
        updatedAt: games.liveStateUpdatedAt,
      })
      .from(games)
      .where(
        sql`${games.startedAt} is not null and ${games.finishedAt} is null and ${games.liveState} is not null`,
      );
    return rows.map((r) => ({ gameId: r.gameId, liveState: r.liveState, updatedAt: r.updatedAt }));
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    return db.select().from(gameParticipants).where(eq(gameParticipants.gameId, gameId));
  }

  async getUserGames(userId: string): Promise<UserGameSummary[]> {
    // Count total players per game in a subquery
    const playerCounts = db
      .select({
        gameId: gameParticipants.gameId,
        total: count(gameParticipants.id).as('total'),
      })
      .from(gameParticipants)
      .groupBy(gameParticipants.gameId)
      .as('player_counts');

    const rows = await db
      .select({
        gameId: games.id,
        scoringMethod: games.scoringMethod,
        targetScore: games.targetScore,
        startedAt: games.startedAt,
        finishedAt: games.finishedAt,
        placement: gameParticipants.placement,
        score: gameParticipants.score,
        playerName: gameParticipants.playerName,
        declaredOut: gameParticipants.declaredOut,
        totalPlayers: playerCounts.total,
      })
      .from(gameParticipants)
      .innerJoin(games, eq(gameParticipants.gameId, games.id))
      .leftJoin(playerCounts, eq(games.id, playerCounts.gameId))
      .where(eq(gameParticipants.userId, userId))
      .orderBy(desc(games.finishedAt));

    return rows.map((r) => ({
      ...r,
      totalPlayers: Number(r.totalPlayers ?? 0),
      earnedCredits: placementToCredits(r.placement, r.declaredOut),
    }));
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const rows = await db
      .select({
        userId: gameParticipants.userId,
        displayName: userProfiles.displayName,
        gamesPlayed: count(gameParticipants.id),
        wins: sql<number>`sum(case when ${gameParticipants.placement} = 1 then 1 else 0 end)`,
        avgPlacement: avg(gameParticipants.placement),
        earnedCredits: userProfiles.earnedCredits,
      })
      .from(gameParticipants)
      .innerJoin(userProfiles, eq(gameParticipants.userId, userProfiles.userId))
      .where(sql`${gameParticipants.userId} is not null`)
      .groupBy(gameParticipants.userId, userProfiles.displayName, userProfiles.earnedCredits)
      .orderBy(
        desc(sql`sum(case when ${gameParticipants.placement} = 1 then 1 else 0 end)`),
        avg(gameParticipants.placement),
      )
      .limit(limit);

    return rows.map((r) => {
      const wins = Number(r.wins ?? 0);
      const gamesPlayed = Number(r.gamesPlayed ?? 0);
      return {
        userId: r.userId!,
        displayName: r.displayName ?? 'Unknown',
        gamesPlayed,
        wins,
        winPct: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
        avgPlacement: r.avgPlacement ? Math.round(Number(r.avgPlacement) * 10) / 10 : 0,
        earnedCredits: r.earnedCredits ?? 0,
      };
    });
  }

  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [newToken] = await db.insert(passwordResetTokens).values(token).returning();
    return newToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    return resetToken || undefined;
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createEmailVerificationToken(token: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    const [newToken] = await db.insert(emailVerificationTokens).values(token).returning();
    return newToken;
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    const [row] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
    return row || undefined;
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
  }

  async markEmailVerified(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Virtual betting methods (entertainment only - no real-world value)
  async getUserChipBalance(userId: string): Promise<number> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return 0;

    if (!profile.lastChipReset) {
      const resetProfile = await this.resetDailyChips(userId);
      return resetProfile.virtualChips;
    }

    const sinceLastResetMs = Date.now() - new Date(profile.lastChipReset).getTime();
    if (sinceLastResetMs >= DAILY_CHIP_RESET_INTERVAL_MS) {
      const resetProfile = await this.resetDailyChips(userId);
      return resetProfile.virtualChips;
    }

    return profile.virtualChips;
  }

  async resetDailyChips(userId: string): Promise<UserProfile> {
    const [profile] = await db
      .update(userProfiles)
      .set({
        virtualChips: DAILY_CHIP_RESET_AMOUNT,
        lastChipReset: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async grantCredits(userId: string, amount: number): Promise<UserProfile> {
    // SQL increment so concurrent grants compose correctly without a read-modify-write race.
    const [profile] = await db
      .update(userProfiles)
      .set({ earnedCredits: sql`${userProfiles.earnedCredits} + ${amount}` })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async placeBet(bet: InsertVirtualBet): Promise<VirtualBet> {
    // Atomic: deduct chips + insert bet row in one transaction. If anything
    // throws (FK violation, missing profile, anything) the rollback restores
    // the chip balance — otherwise a failed insert would orphan the deduction.
    return db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, bet.bettorUserId!));
      if (!profile) throw new Error('User profile not found');
      if (profile.virtualChips < bet.chipAmount) {
        throw new Error('Insufficient chips');
      }
      await tx
        .update(userProfiles)
        .set({ virtualChips: profile.virtualChips - bet.chipAmount })
        .where(eq(userProfiles.userId, bet.bettorUserId!));
      const [newBet] = await tx.insert(virtualBets).values(bet).returning();
      return newBet;
    });
  }

  async updateBetStatus(betId: string, status: 'won' | 'lost' | 'void', payout: number): Promise<VirtualBet> {
    const [bet] = await db
      .update(virtualBets)
      .set({ status, payout })
      .where(eq(virtualBets.id, betId))
      .returning();

    // If won or void, add chips back to user
    if ((status === 'won' || status === 'void') && bet.bettorUserId) {
      const profile = await this.getUserProfile(bet.bettorUserId);
      if (profile) {
        const newBalance = profile.virtualChips + (status === 'won' ? payout : bet.chipAmount);
        await this.updateUserChips(bet.bettorUserId, newBalance);
      }
    }

    return bet;
  }

  async getUserBets(userId: string, limit: number = 20): Promise<VirtualBet[]> {
    const bets = await db
      .select()
      .from(virtualBets)
      .where(eq(virtualBets.bettorUserId, userId))
      .orderBy(sql`${virtualBets.createdAt} DESC`)
      .limit(limit);
    return bets;
  }

  async getGameBets(gameId: string): Promise<VirtualBet[]> {
    const bets = await db
      .select()
      .from(virtualBets)
      .where(eq(virtualBets.gameId, gameId));
    return bets;
  }

  async updateUserChips(userId: string, chipAmount: number): Promise<UserProfile> {
    const [profile] = await db
      .update(userProfiles)
      .set({ virtualChips: chipAmount })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async getChipLeaderboard(limit: number = 10): Promise<{ userId: string; displayName: string; chips: number }[]> {
    const leaders = await db
      .select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        chips: userProfiles.virtualChips,
      })
      .from(userProfiles)
      .orderBy(sql`${userProfiles.virtualChips} DESC`)
      .limit(limit);
    return leaders as { userId: string; displayName: string; chips: number }[];
  }

  async getAdminSettings(): Promise<AdminSettings> {
    const [settings] = await db.select().from(adminSettings).limit(1);

    // Create default settings if none exist
    if (!settings) {
      const [newSettings] = await db
        .insert(adminSettings)
        .values({})
        .returning();
      return newSettings;
    }

    return settings;
  }

  async updateAdminSettings(updates: Partial<InsertAdminSettings>): Promise<AdminSettings> {
    // Get the first (and only) settings record
    const [existing] = await db.select().from(adminSettings).limit(1);

    if (!existing) {
      // Create if doesn't exist
      const [newSettings] = await db
        .insert(adminSettings)
        .values(updates)
        .returning();
      return newSettings;
    }

    // Update existing record
    const [updated] = await db
      .update(adminSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(adminSettings.id, existing.id))
      .returning();
    return updated;
  }
}

// Use in-memory storage when no DATABASE_URL is set
import { MemoryStorage } from './storage-memory';

let storage: IStorage;
if (process.env.DATABASE_URL) {
  storage = new DatabaseStorage();
} else {
  storage = new MemoryStorage();
  console.log('[storage] Using in-memory storage (no DATABASE_URL set)');
}

export { storage };
