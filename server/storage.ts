// From blueprint: javascript_auth_all_persistance
import { type User, type InsertUser, type UserProfile, type InsertUserProfile, type Game, type GameParticipant, type PasswordResetToken, type InsertPasswordResetToken, type VirtualBet, type InsertVirtualBet, type AdminSettings, type InsertAdminSettings } from "@shared/schema";
import { users, userProfiles, games, gameParticipants, passwordResetTokens, virtualBets, adminSettings } from "@shared/schema";
import { randomUUID } from "crypto";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { pool } from "./db";
import { eq, sql } from "drizzle-orm";

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser, displayName?: string): Promise<User>;
  updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User>;
  updateUserTier(userId: string, tier: string): Promise<User>;
  
  // Profile management
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile>;
  
  // Game history (only for paid users)
  createGame(game: any): Promise<Game>;
  updateGame(id: string, updates: { winnerId?: string | null; startedAt?: Date | null; finishedAt?: Date | null }): Promise<Game>;
  addGameParticipant(participant: any): Promise<GameParticipant>;
  getGameParticipants(gameId: string): Promise<GameParticipant[]>;
  getUserGames(userId: string): Promise<any[]>;
  
  // Password reset
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  updateUserPassword(userId: string, hashedPassword: string): Promise<User>;
  
  // Virtual betting (entertainment only - no real-world value)
  getUserChipBalance(userId: string): Promise<number>;
  resetDailyChips(userId: string): Promise<UserProfile>;
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

  async createUser(insertUser: InsertUser, displayName?: string): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          ...insertUser,
          tier: 'free',
        })
        .returning();
      
      console.log('User created:', user.id, user.username);
      
      // Create default profile with provided displayName or username as fallback
      await db.insert(userProfiles).values({
        userId: user.id,
        displayName: displayName || user.username,
        tableTheme: 'green',
      });
      
      console.log('Profile created for user:', user.id);
      
      return user;
    } catch (error) {
      console.error('Error in createUser:', error);
      throw error;
    }
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

  async createGame(game: any): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async updateGame(id: string, updates: { winnerId?: string | null; startedAt?: Date | null; finishedAt?: Date | null }): Promise<Game> {
    const [updated] = await db.update(games).set(updates).where(eq(games.id, id)).returning();
    return updated;
  }

  async addGameParticipant(participant: any): Promise<GameParticipant> {
    const [newParticipant] = await db.insert(gameParticipants).values(participant).returning();
    return newParticipant;
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    return db.select().from(gameParticipants).where(eq(gameParticipants.gameId, gameId));
  }

  async getUserGames(userId: string): Promise<any[]> {
    const userGames = await db
      .select({
        game: games,
        participant: gameParticipants,
      })
      .from(gameParticipants)
      .leftJoin(games, eq(gameParticipants.gameId, games.id))
      .where(eq(gameParticipants.userId, userId));
    
    return userGames;
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

  // Virtual betting methods (entertainment only - no real-world value)
  async getUserChipBalance(userId: string): Promise<number> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return 0;
    
    // Handle profiles without lastChipReset (legacy or new profiles)
    if (!profile.lastChipReset) {
      const resetProfile = await this.resetDailyChips(userId);
      return resetProfile.virtualChips;
    }
    
    // Check if daily reset is needed (24 hours since last reset)
    const now = new Date();
    const lastReset = new Date(profile.lastChipReset);
    const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 24) {
      const resetProfile = await this.resetDailyChips(userId);
      return resetProfile.virtualChips;
    }
    
    return profile.virtualChips;
  }

  async resetDailyChips(userId: string): Promise<UserProfile> {
    const [profile] = await db
      .update(userProfiles)
      .set({ 
        virtualChips: 1000,
        lastChipReset: new Date()
      })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async placeBet(bet: InsertVirtualBet): Promise<VirtualBet> {
    // Deduct chips from user balance
    const profile = await this.getUserProfile(bet.bettorUserId!);
    if (!profile) throw new Error('User profile not found');
    if (profile.virtualChips < bet.chipAmount) {
      throw new Error('Insufficient chips');
    }
    
    // Deduct chips
    await this.updateUserChips(bet.bettorUserId!, profile.virtualChips - bet.chipAmount);
    
    // Create bet record
    const [newBet] = await db.insert(virtualBets).values(bet).returning();
    return newBet;
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
