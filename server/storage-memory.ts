import { type User, type InsertUser, type UserProfile, type InsertUserProfile, type Game, type InsertGame, type GameParticipant, type InsertGameParticipant, type PasswordResetToken, type InsertPasswordResetToken, type EmailVerificationToken, type InsertEmailVerificationToken, type VirtualBet, type InsertVirtualBet, type AdminSettings, type InsertAdminSettings, type Friendship, type FriendWithProfile, type Redemption } from "@shared/schema";
import type { Prize } from "@shared/prizes";
import { randomUUID } from "crypto";
import session from "express-session";
import createMemoryStore from "memorystore";
import { IStorage, UserGameSummary, LeaderboardEntry, DAILY_CHIP_RESET_AMOUNT, DAILY_CHIP_RESET_INTERVAL_MS } from "./storage";

const MemoryStore = createMemoryStore(session);
const SESSION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DECLARE_OUT_CREDIT_BONUS_HISTORY = 25;
const PLACEMENT_CREDITS: Record<number, number> = { 1: 100, 2: 25, 3: 10 };

export class MemoryStorage implements IStorage {
  sessionStore: session.Store;

  private users = new Map<string, User>();
  private usersByUsername = new Map<string, User>();
  private profiles = new Map<string, UserProfile>();
  private gamesList = new Map<string, Game>();
  private participants: GameParticipant[] = [];
  private resetTokens = new Map<string, PasswordResetToken>();
  private verificationTokens = new Map<string, EmailVerificationToken>();
  private bets = new Map<string, VirtualBet>();
  private adminSettingsRow: AdminSettings | null = null;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: SESSION_PRUNE_INTERVAL_MS });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.usersByUsername.get(username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const lower = email.toLowerCase();
    return Array.from(this.users.values()).find(
      (u) => !!u.email && u.email.toLowerCase() === lower,
    );
  }

  async createUser(insertUser: InsertUser, displayName?: string): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email ?? null,
      emailVerified: false,
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
      virtualChips: DAILY_CHIP_RESET_AMOUNT,
      lastChipReset: new Date(),
      earnedCredits: 0,
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
      virtualChips: profile.virtualChips ?? DAILY_CHIP_RESET_AMOUNT,
      lastChipReset: profile.lastChipReset ?? new Date(),
      earnedCredits: profile.earnedCredits ?? 0,
    };
    this.profiles.set(profile.userId, newProfile);
    return newProfile;
  }

  async updateUserProfile(userId: string, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
    const profile = this.profiles.get(userId)!;
    Object.assign(profile, updates);
    return profile;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const id = randomUUID();
    // startedAt is intentionally null at create — it's filled in by updateGame
    // when the lobby actually starts (matches the InsertGame .omit shape).
    const newGame: Game = {
      id,
      startedAt: null,
      finishedAt: game.finishedAt ?? null,
      winnerId: game.winnerId ?? null,
      scoringMethod: game.scoringMethod,
      targetScore: game.targetScore,
      liveState: null,
      liveStateUpdatedAt: null,
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

  private liveStates = new Map<string, { state: unknown; updatedAt: Date }>();

  async persistLiveState(gameId: string, state: unknown): Promise<void> {
    this.liveStates.set(gameId, { state, updatedAt: new Date() });
  }

  async clearLiveState(gameId: string): Promise<void> {
    this.liveStates.delete(gameId);
  }

  async listActiveGameStates(): Promise<Array<{ gameId: string; liveState: unknown; updatedAt: Date | null }>> {
    const out: Array<{ gameId: string; liveState: unknown; updatedAt: Date | null }> = [];
    this.liveStates.forEach((v, gameId) => {
      const game = this.gamesList.get(gameId);
      if (game && game.startedAt && !game.finishedAt) {
        out.push({ gameId, liveState: v.state, updatedAt: v.updatedAt });
      }
    });
    return out;
  }

  async addGameParticipant(participant: InsertGameParticipant): Promise<GameParticipant> {
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

  async getUserGames(userId: string): Promise<UserGameSummary[]> {
    return this.participants
      .filter((p) => p.userId === userId)
      .map((p) => {
        const game = this.gamesList.get(p.gameId);
        const totalPlayers = this.participants.filter((x) => x.gameId === p.gameId).length;
        const credits = (PLACEMENT_CREDITS[p.placement ?? 0] ?? 0) + (p.declaredOut ? DECLARE_OUT_CREDIT_BONUS_HISTORY : 0);
        return {
          gameId: p.gameId,
          scoringMethod: game?.scoringMethod ?? 'fullHand',
          targetScore: game?.targetScore ?? 50,
          startedAt: game?.startedAt ?? null,
          finishedAt: game?.finishedAt ?? null,
          placement: p.placement,
          score: p.score,
          playerName: p.playerName,
          declaredOut: p.declaredOut,
          totalPlayers,
          earnedCredits: credits,
        };
      })
      .sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0));
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const byUser = new Map<string, { displayName: string; gamesPlayed: number; wins: number; placementSum: number; earnedCredits: number }>();

    for (const p of this.participants) {
      if (!p.userId) continue;
      const profile = this.profiles.get(p.userId);
      const displayName = profile?.displayName ?? 'Unknown';
      const entry = byUser.get(p.userId) ?? { displayName, gamesPlayed: 0, wins: 0, placementSum: 0, earnedCredits: profile?.earnedCredits ?? 0 };
      entry.gamesPlayed += 1;
      if (p.placement === 1) entry.wins += 1;
      entry.placementSum += p.placement ?? 0;
      byUser.set(p.userId, entry);
    }

    return Array.from(byUser.entries())
      .map(([userId, e]) => ({
        userId,
        displayName: e.displayName,
        gamesPlayed: e.gamesPlayed,
        wins: e.wins,
        winPct: e.gamesPlayed > 0 ? Math.round((e.wins / e.gamesPlayed) * 100) : 0,
        avgPlacement: e.gamesPlayed > 0 ? Math.round((e.placementSum / e.gamesPlayed) * 10) / 10 : 0,
        earnedCredits: e.earnedCredits,
      }))
      .sort((a, b) => b.wins - a.wins || a.avgPlacement - b.avgPlacement)
      .slice(0, limit);
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

  async createEmailVerificationToken(token: InsertEmailVerificationToken): Promise<EmailVerificationToken> {
    const newToken: EmailVerificationToken = {
      id: randomUUID(),
      userId: token.userId,
      token: token.token,
      expiresAt: token.expiresAt,
      createdAt: new Date(),
    };
    this.verificationTokens.set(token.token, newToken);
    return newToken;
  }

  async getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined> {
    return this.verificationTokens.get(token);
  }

  async deleteEmailVerificationToken(token: string): Promise<void> {
    this.verificationTokens.delete(token);
  }

  async markEmailVerified(userId: string): Promise<User> {
    const user = this.users.get(userId)!;
    user.emailVerified = true;
    return user;
  }

  async getUserChipBalance(userId: string): Promise<number> {
    const profile = this.profiles.get(userId);
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
    const profile = this.profiles.get(userId)!;
    profile.virtualChips = DAILY_CHIP_RESET_AMOUNT;
    profile.lastChipReset = new Date();
    return profile;
  }

  async grantCredits(userId: string, amount: number): Promise<UserProfile> {
    const profile = this.profiles.get(userId);
    if (!profile) throw new Error('User profile not found');
    profile.earnedCredits = (profile.earnedCredits ?? 0) + amount;
    return profile;
  }

  async placeBet(bet: InsertVirtualBet): Promise<VirtualBet> {
    const profile = this.profiles.get(bet.bettorUserId!);
    if (!profile) throw new Error('User profile not found');
    if (profile.virtualChips < bet.chipAmount) {
      throw new Error('Insufficient chips');
    }

    // Mirror the DatabaseStorage transactional behavior: only mutate state once
    // we know the bet object is well-formed and we're about to commit. If we
    // ever add downstream validation (gameId must reference a real game, etc.)
    // a refund block belongs here.
    profile.virtualChips -= bet.chipAmount;

    try {
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
    } catch (err) {
      // Refund — keeps invariant that no chips are ever lost on a failed place.
      profile.virtualChips += bet.chipAmount;
      throw err;
    }
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

  // ── Prizes ───────────────────────────────────────────────────────────────

  private redemptions: Redemption[] = [];

  async redeemPrize(userId: string, prize: Prize): Promise<Redemption> {
    const profile = this.profiles.get(userId);
    if (!profile) throw new Error('User profile not found');
    if (profile.earnedCredits < prize.creditCost) {
      throw new Error('Insufficient credits');
    }
    if (prize.kind === 'extra_chips') {
      const chips = Number(prize.payload.chips ?? 0);
      if (!Number.isFinite(chips) || chips <= 0) throw new Error('Invalid prize payload');
      profile.earnedCredits -= prize.creditCost;
      profile.virtualChips += chips;
    } else {
      throw new Error(`Unknown prize kind: ${prize.kind}`);
    }
    const row: Redemption = {
      id: randomUUID(),
      userId,
      prizeId: prize.id,
      creditsSpent: prize.creditCost,
      prizeSnapshot: prize,
      createdAt: new Date(),
      fulfilledAt: new Date(),
    };
    this.redemptions.push(row);
    return row;
  }

  async listUserRedemptions(userId: string, limit = 20): Promise<Redemption[]> {
    return this.redemptions
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ── Friends ──────────────────────────────────────────────────────────────

  private friendships: Friendship[] = [];

  async listFriends(userId: string): Promise<FriendWithProfile[]> {
    const out: FriendWithProfile[] = [];
    for (const row of this.friendships) {
      if (row.userId !== userId && row.friendId !== userId) continue;
      const incoming = row.friendId === userId && row.status === 'pending';
      // Skip accepted reciprocal rows where we're the "owner" but the friend
      // also has their own outbound row — we don't want them listed twice.
      // Outbound from us is the canonical representation in the merged list;
      // we just additionally include inbound pending requests.
      if (!incoming && row.userId !== userId) continue;
      const friendId = incoming ? row.userId : row.friendId;
      const friendUser = this.users.get(friendId);
      const friendProfile = this.profiles.get(friendId);
      if (!friendUser) continue;
      out.push({
        friendshipId: row.id,
        friendUserId: friendId,
        status: row.status as FriendWithProfile['status'],
        incoming,
        displayName: friendProfile?.displayName ?? friendUser.username,
        username: friendUser.username,
      });
    }
    return out;
  }

  async sendFriendRequest(userId: string, friendId: string): Promise<Friendship> {
    if (userId === friendId) throw new Error("You can't friend yourself");
    const existing = this.friendships.find(
      (r) =>
        (r.userId === userId && r.friendId === friendId) ||
        (r.userId === friendId && r.friendId === userId),
    );
    if (existing) return existing;
    const row: Friendship = {
      id: randomUUID(),
      userId,
      friendId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.friendships.push(row);
    return row;
  }

  async acceptFriendRequest(userId: string, friendshipId: string): Promise<void> {
    const row = this.friendships.find((r) => r.id === friendshipId);
    if (!row) throw new Error('Friend request not found');
    if (row.friendId !== userId) throw new Error('You are not the target of this request');
    if (row.status === 'accepted') return;
    row.status = 'accepted';
    row.updatedAt = new Date();
    const recip = this.friendships.find(
      (r) => r.userId === userId && r.friendId === row.userId,
    );
    if (recip) {
      recip.status = 'accepted';
      recip.updatedAt = new Date();
    } else {
      this.friendships.push({
        id: randomUUID(),
        userId,
        friendId: row.userId,
        status: 'accepted',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async removeFriendship(userId: string, friendshipId: string): Promise<void> {
    const row = this.friendships.find((r) => r.id === friendshipId);
    if (!row) return;
    if (row.userId !== userId && row.friendId !== userId) {
      throw new Error('Not your friendship');
    }
    const a = row.userId;
    const b = row.friendId;
    this.friendships = this.friendships.filter(
      (r) =>
        !(
          (r.userId === a && r.friendId === b) ||
          (r.userId === b && r.friendId === a)
        ),
    );
  }
}
