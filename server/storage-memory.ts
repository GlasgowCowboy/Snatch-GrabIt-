import { type User, type InsertUser, type UserProfile, type InsertUserProfile, type Game, type GameParticipant, type PasswordResetToken, type InsertPasswordResetToken, type VirtualBet, type InsertVirtualBet, type AdminSettings, type InsertAdminSettings } from "@shared/schema";
import { randomUUID } from "crypto";
import session from "express-session";
import createMemoryStore from "memorystore";
import { IStorage } from "./storage";

const MemoryStore = createMemoryStore(session);

export class MemoryStorage implements IStorage {
  sessionStore: session.Store;

  private users = new Map<string, User>();
  private usersByUsername = new Map<string, User>();
  private profiles = new Map<string, UserProfile>();
  private gamesList = new Map<string, Game>();
  private participants: GameParticipant[] = [];
  private resetTokens = new Map<string, PasswordResetToken>();
  private bets = new Map<string, VirtualBet>();
  private adminSettingsRow: AdminSettings | null = null;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersByUsername.get(username);
  }

  async createUser(insertUser: InsertUser, displayName?: string): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email ?? null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      tier: 'free',
      isAdmin: false,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    this.usersByUsername.set(user.username, user);

    // Create default profile
    const profile: UserProfile = {
      id: randomUUID(),
      userId: id,
      displayName: displayName || user.username,
      avatarUrl: null,
      cardBackUrl: null,
      tableTheme: 'green',
      bonePilePosition: 'left',
      bio: null,
      virtualChips: 1000,
      lastChipReset: new Date(),
    };
    this.profiles.set(id, profile);

    return user;
  }

  async updateUserStripeInfo(userId: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User> {
    const user = this.users.get(userId)!;
    user.stripeCustomerId = stripeCustomerId;
    user.stripeSubscriptionId = stripeSubscriptionId;
    return user;
  }

  async updateUserTier(userId: string, tier: string): Promise<User> {
    const user = this.users.get(userId)!;
    user.tier = tier;
    return user;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return this.profiles.get(userId);
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const newProfile: UserProfile = {
      id: randomUUID(),
      userId: profile.userId,
      displayName: profile.displayName ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      cardBackUrl: profile.cardBackUrl ?? null,
      tableTheme: profile.tableTheme ?? 'green',
      bonePilePosition: profile.bonePilePosition ?? 'left',
      bio: profile.bio ?? null,
      virtualChips: profile.virtualChips ?? 1000,
      lastChipReset: profile.lastChipReset ?? new Date(),
    };
    this.profiles.set(profile.userId, newProfile);
    return newProfile;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
    const profile = this.profiles.get(userId)!;
    Object.assign(profile, updates);
    return profile;
  }

  async createGame(game: any): Promise<Game> {
    const id = randomUUID();
    const newGame: Game = {
      id,
      startedAt: game.startedAt ?? null,
      finishedAt: game.finishedAt ?? null,
      winnerId: game.winnerId ?? null,
      scoringMethod: game.scoringMethod,
      targetScore: game.targetScore,
    };
    this.gamesList.set(id, newGame);
    return newGame;
  }

  async updateGame(id: string, updates: { winnerId?: string | null; startedAt?: Date | null; finishedAt?: Date | null }): Promise<Game> {
    const game = this.gamesList.get(id);
    if (!game) throw new Error(`Game ${id} not found`);
    if (updates.winnerId !== undefined) game.winnerId = updates.winnerId;
    if (updates.startedAt !== undefined) game.startedAt = updates.startedAt;
    if (updates.finishedAt !== undefined) game.finishedAt = updates.finishedAt;
    return game;
  }

  async addGameParticipant(participant: any): Promise<GameParticipant> {
    const newParticipant: GameParticipant = {
      id: randomUUID(),
      gameId: participant.gameId,
      userId: participant.userId ?? null,
      playerName: participant.playerName,
      score: participant.score ?? 0,
      placement: participant.placement ?? null,
      declaredOut: participant.declaredOut ?? false,
    };
    this.participants.push(newParticipant);
    return newParticipant;
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    return this.participants.filter((p) => p.gameId === gameId);
  }

  async getUserGames(userId: string): Promise<any[]> {
    return this.participants
      .filter(p => p.userId === userId)
      .map(p => ({
        game: this.gamesList.get(p.gameId),
        participant: p,
      }));
  }

  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const newToken: PasswordResetToken = {
      id: randomUUID(),
      userId: token.userId,
      token: token.token,
      expiresAt: token.expiresAt,
      createdAt: new Date(),
    };
    this.resetTokens.set(token.token, newToken);
    return newToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return this.resetTokens.get(token);
  }

  async deletePasswordResetToken(token: string): Promise<void> {
    this.resetTokens.delete(token);
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<User> {
    const user = this.users.get(userId)!;
    user.password = hashedPassword;
    return user;
  }

  async getUserChipBalance(userId: string): Promise<number> {
    const profile = this.profiles.get(userId);
    if (!profile) return 0;

    if (!profile.lastChipReset) {
      const resetProfile = await this.resetDailyChips(userId);
      return resetProfile.virtualChips;
    }

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
    const profile = this.profiles.get(userId)!;
    profile.virtualChips = 1000;
    profile.lastChipReset = new Date();
    return profile;
  }

  async placeBet(bet: InsertVirtualBet): Promise<VirtualBet> {
    const profile = this.profiles.get(bet.bettorUserId!);
    if (!profile) throw new Error('User profile not found');
    if (profile.virtualChips < bet.chipAmount) {
      throw new Error('Insufficient chips');
    }

    profile.virtualChips -= bet.chipAmount;

    const id = randomUUID();
    const newBet: VirtualBet = {
      id,
      gameId: bet.gameId,
      bettorUserId: bet.bettorUserId ?? null,
      bettorName: bet.bettorName,
      betType: bet.betType,
      targetUserId: bet.targetUserId ?? null,
      targetPlayerName: bet.targetPlayerName ?? null,
      chipAmount: bet.chipAmount,
      payout: bet.payout ?? 0,
      status: bet.status ?? 'pending',
      createdAt: new Date(),
    };
    this.bets.set(id, newBet);
    return newBet;
  }

  async updateBetStatus(betId: string, status: 'won' | 'lost' | 'void', payout: number): Promise<VirtualBet> {
    const bet = this.bets.get(betId)!;
    bet.status = status;
    bet.payout = payout;

    if ((status === 'won' || status === 'void') && bet.bettorUserId) {
      const profile = this.profiles.get(bet.bettorUserId);
      if (profile) {
        const newBalance = profile.virtualChips + (status === 'won' ? payout : bet.chipAmount);
        profile.virtualChips = newBalance;
      }
    }

    return bet;
  }

  async getUserBets(userId: string, limit: number = 20): Promise<VirtualBet[]> {
    return Array.from(this.bets.values())
      .filter(b => b.bettorUserId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getGameBets(gameId: string): Promise<VirtualBet[]> {
    return Array.from(this.bets.values()).filter(b => b.gameId === gameId);
  }

  async updateUserChips(userId: string, chipAmount: number): Promise<UserProfile> {
    const profile = this.profiles.get(userId)!;
    profile.virtualChips = chipAmount;
    return profile;
  }

  async getChipLeaderboard(limit: number = 10): Promise<{ userId: string; displayName: string; chips: number }[]> {
    return Array.from(this.profiles.values())
      .map(p => ({ userId: p.userId, displayName: p.displayName || 'Unknown', chips: p.virtualChips }))
      .sort((a, b) => b.chips - a.chips)
      .slice(0, limit);
  }

  async getAdminSettings(): Promise<AdminSettings> {
    if (!this.adminSettingsRow) {
      this.adminSettingsRow = {
        id: randomUUID(),
        easyMoveDelayMin: 1500,
        easyMoveDelayMax: 3000,
        easyIntelligence: 50,
        mediumMoveDelayMin: 800,
        mediumMoveDelayMax: 1500,
        mediumIntelligence: 75,
        hardMoveDelayMin: 400,
        hardMoveDelayMax: 800,
        hardIntelligence: 95,
        sponsorLogoUrl: null,
        sponsorText: null,
        sponsorLink: null,
        sponsorEnabled: false,
        updatedAt: new Date(),
      };
    }
    return this.adminSettingsRow;
  }

  async updateAdminSettings(updates: Partial<InsertAdminSettings>): Promise<AdminSettings> {
    const settings = await this.getAdminSettings();
    Object.assign(settings, updates, { updatedAt: new Date() });
    return settings;
  }
}
