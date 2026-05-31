import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { roomManager, RoomError } from "./rooms";
import { gameSocket } from "./gameSocket";
import { inviteManager } from "./invites";
import { sendEmail, appUrl } from "./email";
import { log } from "./vite";
import { recordHeartbeat, filterOnline } from "./presence";
import { PRIZE_CATALOG, findPrize } from "@shared/prizes";
import { joinQueue, leaveQueue, getStatus as getMatchmakingStatus } from "./matchmaking";
import {
  recordImpression,
  recordClick,
  getEngagementSnapshot,
  isKnownSlot,
  revertImpressionAward,
} from "./ad-engagement";
import {
  createPrintOrder,
  getPrintConfig,
  getPrintOrder,
  listOrdersForUser,
  verifyOrderToken,
  PrintError,
} from "./print";
import { createPrintOrderSchema } from "@shared/print";

// Cap room creation per IP so a single abuser can't fill the in-memory room store.
const roomCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many rooms created from this address. Try again later.' },
});

// Cap username-targeted invites — these are otherwise a vector for spamming
// notifications to arbitrary users.
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many invites sent. Try again later.' },
});

// Per-user cooldown for the rewarded-ad grant endpoint.  Stored in-memory (not
// DB) because precision across restarts isn't required — the goal is to prevent
// rapid-fire farming within a session, not rock-solid once-per-lifetime auditing.
// Key: userId  Value: timestamp of last successful grant
const adGrantLastClaimed = new Map<string, number>();
const AD_GRANT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Rate-limit click pings — even though clicks are auth-gated and slot-validated,
// a single user firing thousands of POSTs/min would still pollute CTR.
const adClickLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many click pings — slow down.' },
});

// Per-IP cap on print-order intake. Orders cost staff time to triage in the
// manual queue, and the in-memory Map has a hard size cap below.
const printOrderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many orders submitted from this address. Try again later.' },
});
import {
  createRoomBodySchema,
  joinRoomBodySchema,
  readyBodySchema,
  startBodySchema,
  leaveBodySchema,
} from "@shared/rooms";
import { z } from "zod";

function handleRoomError(error: unknown, res: import("express").Response) {
  if (error instanceof RoomError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Invalid request body", errors: error.errors });
  }
  throw error;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes: /api/register, /api/login, /api/logout, /api/user
  setupAuth(app);

  // User profile routes
  app.get("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const profile = await storage.getUserProfile(req.user!.id);
    res.json(profile);
  });

  app.patch("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Validate input with Zod schema to prevent data corruption
    const profileUpdateSchema = z.object({
      displayName: z.string().max(50).optional(),
      bio: z.string().max(500).optional(),
      bonePilePosition: z.enum(['left', 'right']).optional(),
    });

    try {
      const validated = profileUpdateSchema.parse(req.body);
      const profile = await storage.updateUserProfile(req.user!.id, validated);
      res.json(profile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      throw error;
    }
  });

  // Every authenticated user can see their own history. The `tier` column stays
  // on the users table so a Stripe-backed premium gate can be reintroduced later
  // for *other* features (e.g. extended stats, premium cosmetics) without
  // breaking the basic "see your own games" affordance every new signup expects.
  app.get("/api/games/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const history = await storage.getUserGames(req.user!.id);
    res.json(history);
  });

  // Global leaderboard — public, sorted by wins → avg placement
  app.get("/api/leaderboard", async (_req, res) => {
    const leaders = await storage.getLeaderboard(50);
    res.json(leaders);
  });

  // The authenticated user's current global rank (1-indexed position in leaderboard)
  app.get("/api/leaderboard/my-rank", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const leaders = await storage.getLeaderboard(500);
    const rank = leaders.findIndex((l) => l.userId === req.user!.id) + 1;
    const entry = leaders.find((l) => l.userId === req.user!.id);
    res.json({
      rank: rank > 0 ? rank : null,
      totalPlayers: leaders.length,
      wins: entry?.wins ?? 0,
      gamesPlayed: entry?.gamesPlayed ?? 0,
      winPct: entry?.winPct ?? 0,
      avgPlacement: entry?.avgPlacement ?? 0,
    });
  });

  // ── Friends + Presence ──────────────────────────────────────────────────

  app.get("/api/friends", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const friends = await storage.listFriends(req.user!.id);
    // Decorate with online flag so the UI can show a green dot inline.
    const ids = friends.map((f) => f.friendUserId);
    const onlineSet = new Set(filterOnline(ids));
    res.json(
      friends.map((f) => ({ ...f, online: onlineSet.has(f.friendUserId) })),
    );
  });

  app.post("/api/friends/request", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const schema = z.object({ username: z.string().min(1).max(50) });
      const { username } = schema.parse(req.body);
      const target = await storage.getUserByUsername(username);
      if (!target) return res.status(404).json({ message: "No user with that username" });
      if (target.id === req.user!.id) return res.status(400).json({ message: "You can't friend yourself" });
      const row = await storage.sendFriendRequest(req.user!.id, target.id);
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  });

  app.post("/api/friends/:id/accept", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.acceptFriendRequest(req.user!.id, req.params.id);
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  });

  app.delete("/api/friends/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.removeFriendship(req.user!.id, req.params.id);
      res.sendStatus(204);
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  });

  /** Heartbeat — clients hit this every 30 s while focused. Powers /api/friends online flags. */
  app.post("/api/presence/heartbeat", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    recordHeartbeat(req.user!.id);
    res.sendStatus(204);
  });

  // ── Prize catalog + redemption ──────────────────────────────────────────

  /** Public — anyone can browse the catalog (no chips spent here). */
  app.get("/api/prizes", (_req, res) => {
    res.json(PRIZE_CATALOG);
  });

  /** Redeem a prize — atomic credit-spend + payload apply. */
  app.post("/api/prizes/:id/redeem", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const prize = findPrize(req.params.id);
    if (!prize) return res.status(404).json({ message: "Unknown prize" });
    try {
      const redemption = await storage.redeemPrize(req.user!.id, prize);
      res.status(201).json(redemption);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Redemption failed";
      // 400 covers the user-facing "Insufficient credits" + payload errors;
      // anything else genuinely unexpected still surfaces as 400 here rather
      // than 500 so it stays user-actionable.
      res.status(400).json({ message });
    }
  });

  /** Logged-in user's redemption history — for "your purchases" lists. */
  app.get("/api/prizes/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const limit = parseInt(req.query.limit as string) || 20;
    const rows = await storage.listUserRedemptions(req.user!.id, limit);
    res.json(rows);
  });

  // ── Matchmaking queue ──────────────────────────────────────────────────

  app.post("/api/matchmaking/queue", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const schema = z.object({
        scoringMethod: z.enum(['fullHand', 'round', 'timed']),
        targetScore: z.number().int().positive(),
        durationSec: z.number().int().min(60).max(60 * 60).optional(),
      });
      const body = schema.parse(req.body);
      const status = await joinQueue({
        userId: req.user!.id,
        username: req.user!.username,
        scoringMethod: body.scoringMethod,
        targetScore: body.targetScore,
        durationSec: body.durationSec,
      });
      res.json(status);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request', errors: e.errors });
      }
      throw e;
    }
  });

  app.delete("/api/matchmaking/queue", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    leaveQueue(req.user!.id);
    res.sendStatus(204);
  });

  app.get("/api/matchmaking/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const status = await getMatchmakingStatus(req.user!.id);
    res.json(status);
  });

  // ── Rewarded video ad grant ───────────────────────────────────────────────
  // In production: set GOOGLE_ADSENSE_CLIENT env var and the client will load
  // the real Google AdSense rewarded-video SDK. The client sends a signed
  // `adToken` (from the ad network callback) which we verify server-side before
  // granting credits. When GOOGLE_ADSENSE_CLIENT is absent (dev/staging) the
  // client shows a 15-second simulated ad and sends token="dev-simulated".
  const AD_REWARD_CREDITS = 50;

  app.post("/api/ads/rewarded-complete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { adToken } = req.body as { adToken?: string };
    if (!adToken) return res.status(400).json({ message: "adToken required" });

    // Rate-limit: one grant per user per hour regardless of how many ad tokens
    // they send.  Prevents farming credits by rapidly replaying the endpoint.
    const userId = req.user!.id;
    const now = Date.now();
    const lastClaimed = adGrantLastClaimed.get(userId) ?? 0;
    const sinceLastMs = now - lastClaimed;
    if (sinceLastMs < AD_GRANT_COOLDOWN_MS) {
      const waitMin = Math.ceil((AD_GRANT_COOLDOWN_MS - sinceLastMs) / 60_000);
      return res.status(429).json({
        message: `You've already claimed your ad reward this hour. Try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}.`,
        retryAfterMs: AD_GRANT_COOLDOWN_MS - sinceLastMs,
      });
    }

    // Production: verify the token with the Google Ad Manager postback.
    // Dev / no-SDK: accept the sentinel string "dev-simulated" only when
    // GOOGLE_ADSENSE_CLIENT is not configured.
    const isDev = !process.env.GOOGLE_ADSENSE_CLIENT;
    if (!isDev && adToken === "dev-simulated") {
      return res.status(403).json({ message: "Simulated tokens not accepted in production" });
    }
    // TODO (production): call Google's SSV (server-side verification) endpoint
    // with the adToken + user-id and confirm it's legitimate before granting.
    // https://developers.google.com/ad-manager/api/reference/v202402/InventoryService

    // Record the grant *before* the async DB write so a concurrent request
    // racing in the same tick doesn't slip through.
    adGrantLastClaimed.set(userId, now);
    await storage.grantCredits(userId, AD_REWARD_CREDITS);
    log(`rewarded-ad grant: user=${userId} +${AD_REWARD_CREDITS} credits`);
    res.json({ granted: AD_REWARD_CREDITS });
  });

  // Config endpoint so the client knows whether the real SDK is available
  app.get("/api/ads/config", (_req, res) => {
    res.json({
      adsenseClient: process.env.GOOGLE_ADSENSE_CLIENT ?? null,
      rewardCredits: AD_REWARD_CREDITS,
    });
  });

  // ── Passive ad-view credit rewards (#44) ──────────────────────────────────
  // The AdSlot React component fires this on mount for each slot it renders.
  // We credit 1 credit per slot per UTC day per user (cap 25/day) so casual
  // play that sees several different ads accumulates a small reward without
  // becoming a tab-flipping farming game.
  const adSlotBodySchema = z.object({
    // Accept the AdSense slot ID (a string of digits in the real config, but
    // any short label is fine for engagement counting).
    slot: z.string().min(1).max(64),
  });

  app.post("/api/ads/impression", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { slot } = adSlotBodySchema.parse(req.body);
      // Allowlist check — without this, an authed user can POST 25 distinct
      // fake slot IDs and farm the full daily passive-credit cap. The
      // in-memory engagement maps would also grow unbounded.
      if (!isKnownSlot(slot)) {
        return res.status(400).json({ message: 'Unknown ad slot' });
      }
      const userId = req.user!.id;
      const result = recordImpression(userId, slot);
      if (result.creditsAwarded > 0) {
        try {
          await storage.grantCredits(userId, result.creditsAwarded);
        } catch (dbErr) {
          // Roll back the in-memory mutation so the user's next call can
          // retry instead of being silently shorted (the seen-set would
          // otherwise still think this slot had been counted today).
          revertImpressionAward(userId, slot, result.creditsAwarded);
          throw dbErr;
        }
      }
      res.json(result);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request', errors: e.errors });
      }
      // Forward to Express error handler instead of throwing in an async
      // handler (Express 4 doesn't await route promises).
      return next(e);
    }
  });

  app.post("/api/ads/click", adClickLimiter, (req, res, next) => {
    // Auth-gated — an unauthed click endpoint is a CTR-pollution vector, and
    // CTR data drives the direct-sponsor pitch in /admin (#45).
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { slot } = adSlotBodySchema.parse(req.body);
      if (!isKnownSlot(slot)) {
        return res.status(400).json({ message: 'Unknown ad slot' });
      }
      recordClick(slot);
      res.sendStatus(204);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request', errors: e.errors });
      }
      return next(e);
    }
  });

  // ── Print-on-demand (#52) ─────────────────────────────────────────────────
  // V1 scaffold: catalog + order intake. Payments + vendor wiring are gated
  // behind env vars; until set, orders enter a manual-fulfilment queue.

  app.get("/api/print/config", (_req, res) => {
    res.json(getPrintConfig());
  });

  app.post("/api/print/orders", printOrderLimiter, (req, res, next) => {
    try {
      const input = createPrintOrderSchema.parse(req.body);
      const userId = req.isAuthenticated() ? req.user!.id : null;
      const response = createPrintOrder(input, userId);
      res.status(201).json(response);
    } catch (e) {
      if (e instanceof PrintError) {
        return res.status(e.statusCode).json({ message: e.message });
      }
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request', errors: e.errors });
      }
      return next(e);
    }
  });

  app.get("/api/print/orders", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json({ orders: listOrdersForUser(req.user!.id) });
  });

  app.get("/api/print/orders/:id", (req, res) => {
    // Authorise BEFORE looking up the order so we don't reveal whether a
    // given ID exists via the 404-vs-403 differential. Three accepted
    // identities: (a) HMAC-signed ?token=... that matches the order's email,
    // (b) authed session owning the order, (c) admin session.
    const id = req.params.id;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const isAuthed = req.isAuthenticated();
    const isAdmin = isAuthed && req.user!.isAdmin;

    // Without any credential at all, refuse before touching the store.
    if (!isAuthed && !token) {
      return res.status(401).json({ message: 'Authentication or token required' });
    }

    const order = getPrintOrder(id);
    // For unauthorized callers we return 403 whether or not the order exists
    // (no existence oracle). Only admins get a distinct 404.
    const tokenOk = !!token && !!order && verifyOrderToken(id, order.email, token);
    const isOwner = isAuthed && !!order && order.userId === req.user!.id;

    if (!isAdmin && !isOwner && !tokenOk) {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ order });
  });

  // ── Sponsor-pitch engagement snapshot (#45) ───────────────────────────────
  // Admin-only. Tells us which slots get the most attention so we can pitch
  // direct sponsors on the highest-performing ones rather than relying on
  // AdSense's auction prices.
  app.get("/api/ads/engagement", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.user!.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    res.json({ slots: getEngagementSnapshot() });
  });

  // Virtual betting routes (entertainment only - no real-world value)
  app.get("/api/betting/balance", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const balance = await storage.getUserChipBalance(req.user!.id);
    res.json({ chips: balance });
  });

  // Persistent earned-credits balance. Distinct from /api/betting/balance —
  // chips reset daily and are spent on bets; credits are earned via gameplay
  // (and eventually purchased) and never reset.
  app.get("/api/credits/balance", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const profile = await storage.getUserProfile(req.user!.id);
    res.json({ credits: profile?.earnedCredits ?? 0 });
  });

  app.post("/api/betting/place", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // UUID shape for ids — virtual_bets has FKs on game_id and target_user_id,
      // so anything that isn't a real UUID would just trip a Postgres constraint
      // error inside the placeBet transaction. Catch it at the edge with a
      // friendlier message and the proper 400 contract.
      const uuid = z.string().uuid('Must be a valid id');
      const betSchema = z.object({
        gameId: uuid,
        betType: z.enum(['winner', 'declareOut', 'confidence', 'sidebet']),
        // Real auth user id when the target is a registered player. Optional —
        // AI players and guests have no users.id row; settlement falls back to
        // matching by playerName.
        targetUserId: uuid.optional(),
        targetPlayerName: z.string().min(1).max(100).optional(),
        chipAmount: z.number().int().min(1),
      }).refine(
        (data) => data.betType === 'confidence' || !!data.targetPlayerName,
        { message: 'Target player is required for non-confidence bets', path: ['targetPlayerName'] },
      );

      const validated = betSchema.parse(req.body);

      // Calculate potential payout based on bet type
      let payout = 0;
      if (validated.betType === 'confidence') {
        payout = Math.floor(validated.chipAmount * 1.5); // 1.5x for self-bet
      } else if (validated.betType === 'winner' || validated.betType === 'declareOut') {
        payout = validated.chipAmount * 2; // 2x for prediction bets
      } else {
        payout = validated.chipAmount * 2; // 2x for side bets
      }

      const bet = await storage.placeBet({
        gameId: validated.gameId,
        bettorUserId: req.user!.id,
        bettorName: req.user!.username,
        betType: validated.betType,
        targetUserId: validated.targetUserId,
        targetPlayerName: validated.targetPlayerName,
        chipAmount: validated.chipAmount,
        payout,
        status: 'pending',
      });

      res.json(bet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid bet data", errors: error.errors });
      }
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  });

  app.get("/api/betting/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const limit = parseInt(req.query.limit as string) || 20;
    const bets = await storage.getUserBets(req.user!.id, limit);
    res.json(bets);
  });

  // Bets the authenticated user placed on a specific game — used by the
  // post-game Scoreboard to show won/lost outcomes immediately after settling.
  app.get("/api/betting/game/:gameId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { gameId } = req.params;
    // Return only this user's bets for the game (not everyone's)
    const allBets = await storage.getGameBets(gameId);
    const myBets = allBets.filter((b) => b.bettorUserId === req.user!.id);
    res.json(myBets);
  });

  app.get("/api/betting/leaderboard", async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaders = await storage.getChipLeaderboard(limit);
    res.json(leaders);
  });

  app.post("/api/betting/reset", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const profile = await storage.resetDailyChips(req.user!.id);
    res.json({ chips: profile.virtualChips });
  });

  // Admin routes (admin-only access)
  app.get("/api/admin/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    if (!req.user!.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const settings = await storage.getAdminSettings();
    res.json(settings);
  });

  app.patch("/api/admin/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    if (!req.user!.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const updateSchema = z.object({
      easyMoveDelayMin: z.number().min(100).max(5000).optional(),
      easyMoveDelayMax: z.number().min(100).max(5000).optional(),
      easyIntelligence: z.number().min(0).max(100).optional(),
      mediumMoveDelayMin: z.number().min(100).max(5000).optional(),
      mediumMoveDelayMax: z.number().min(100).max(5000).optional(),
      mediumIntelligence: z.number().min(0).max(100).optional(),
      hardMoveDelayMin: z.number().min(100).max(5000).optional(),
      hardMoveDelayMax: z.number().min(100).max(5000).optional(),
      hardIntelligence: z.number().min(0).max(100).optional(),
      sponsorLogoUrl: z.string().url().optional().nullable(),
      sponsorText: z.string().max(200).optional().nullable(),
      sponsorLink: z.string().url().optional().nullable(),
      sponsorEnabled: z.boolean().optional(),
    });

    try {
      const validated = updateSchema.parse(req.body);
      const settings = await storage.updateAdminSettings(validated);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      }
      throw error;
    }
  });

  // Public endpoint to get sponsor settings (for display)
  app.get("/api/sponsor", async (req, res) => {
    const settings = await storage.getAdminSettings();

    if (!settings.sponsorEnabled) {
      return res.json({ enabled: false });
    }

    res.json({
      enabled: true,
      logoUrl: settings.sponsorLogoUrl,
      text: settings.sponsorText,
      link: settings.sponsorLink,
    });
  });

  // Game room routes (ephemeral, in-memory lobbies)
  app.post("/api/rooms", roomCreateLimiter, async (req, res) => {
    try {
      const body = createRoomBodySchema.parse(req.body);
      const result = await roomManager.createRoom({ ...body, userId: req.user?.id });
      res.status(201).json(result);
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  app.get("/api/rooms/:code", (req, res) => {
    const room = roomManager.getRoom(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json(room);
  });

  app.post("/api/rooms/:code/join", (req, res) => {
    try {
      const body = joinRoomBodySchema.parse(req.body);
      const code = req.params.code.toUpperCase();
      const result = roomManager.joinRoom(code, {
        ...body,
        userId: req.user?.id,
      });
      gameSocket.broadcastRoom(code);
      res.json(result);
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  app.post("/api/rooms/:code/ready", (req, res) => {
    try {
      const body = readyBodySchema.parse(req.body);
      const code = req.params.code.toUpperCase();
      const room = roomManager.toggleReady(code, body.playerId);
      gameSocket.broadcastRoom(code);
      res.json(room);
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  app.post("/api/rooms/:code/start", async (req, res) => {
    try {
      const body = startBodySchema.parse(req.body);
      const room = await roomManager.startGame(req.params.code.toUpperCase(), body.playerId);
      gameSocket.onGameStarted(room);
      res.json(room);
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  app.post("/api/rooms/:code/leave", (req, res) => {
    try {
      const body = leaveBodySchema.parse(req.body);
      const code = req.params.code.toUpperCase();
      const room = roomManager.leaveRoom(code, body.playerId);
      // Closes the leaver's WS and rebroadcasts to remaining clients if any.
      gameSocket.onPlayerLeft(code, body.playerId);
      // Room was destroyed — purge any pending invites that pointed at it.
      if (!room) inviteManager.removeByRoomCode(code);
      res.json({ room: room ?? null });
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  // Username-based invite ("send a friend a room invite").
  // In-memory only: invites expire after 30 minutes and are dropped when the
  // referenced room is destroyed.
  app.post("/api/invite", inviteLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const body = z
        .object({
          code: z.string().min(1).max(16),
          targetUsername: z.string().min(1).max(50),
        })
        .parse(req.body);
      const code = body.code.toUpperCase();
      const room = roomManager.getRoom(code);
      if (!room) return res.status(404).json({ message: "Room not found" });

      const senderInRoom = room.players.find((p) => p.userId === req.user!.id);
      if (!senderInRoom) {
        return res.status(403).json({ message: "Only players in the room can invite" });
      }

      const target = await storage.getUserByUsername(body.targetUsername);
      if (!target) {
        return res.status(404).json({ message: "No user with that username" });
      }
      if (target.id === req.user!.id) {
        return res.status(400).json({ message: "You're already in the room" });
      }

      const invite = inviteManager.add({
        code: room.code,
        gameDbId: room.gameDbId,
        scoringMethod: room.scoringMethod,
        targetScore: room.targetScore,
        hostUserId: senderInRoom.userId ?? null,
        hostName: senderInRoom.name,
        targetUserId: target.id,
      });

      // Best-effort email notification if the recipient has an address on file.
      if (target.email) {
        const joinUrl = `${appUrl()}/?join=${encodeURIComponent(room.code)}`;
        const text = [
          `Hi ${target.username},`,
          '',
          `${senderInRoom.name} has invited you to play Snatch&GrabIt! Tap the link below to join — or open the app and you'll see it under "Invites".`,
          '',
          joinUrl,
          '',
          `Room code: ${room.code}`,
        ].join('\n');
        void sendEmail({ to: target.email, subject: `${senderInRoom.name} invited you to Snatch&GrabIt!`, text });
      }

      res.status(201).json(invite);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid invite", errors: error.errors });
      }
      throw error;
    }
  });

  // Invite by raw email address — works whether or not the recipient already
  // has an account. We just send them the join link via email. If they DO have
  // an account, we also drop an in-app pending invite so they see it the next
  // time they log in.
  app.post("/api/invite/email", inviteLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const body = z
        .object({
          code: z.string().min(1).max(16),
          email: z.string().email('Enter a valid email address').max(254),
        })
        .parse(req.body);
      const code = body.code.toUpperCase();
      const room = roomManager.getRoom(code);
      if (!room) return res.status(404).json({ message: "Room not found" });

      const senderInRoom = room.players.find((p) => p.userId === req.user!.id);
      if (!senderInRoom) {
        return res.status(403).json({ message: "Only players in the room can invite" });
      }

      // If the email belongs to an existing user, also queue the in-app invite
      // so they don't have to dig through their inbox.
      const targetByEmail = await storage.getUserByEmail(body.email);
      let invitePayload: object | null = null;
      if (targetByEmail && targetByEmail.id !== req.user!.id) {
        const invite = inviteManager.add({
          code: room.code,
          gameDbId: room.gameDbId,
          scoringMethod: room.scoringMethod,
          targetScore: room.targetScore,
          hostUserId: senderInRoom.userId ?? null,
          hostName: senderInRoom.name,
          targetUserId: targetByEmail.id,
        });
        invitePayload = invite;
      }

      const joinUrl = `${appUrl()}/?join=${encodeURIComponent(room.code)}`;
      const text = [
        `${senderInRoom.name} has invited you to play Snatch&GrabIt!`,
        '',
        targetByEmail
          ? "Tap the link to join. You'll also see it under \"Invites\" when you log in."
          : "Tap the link to join. You'll be prompted to create a quick account on the way in.",
        '',
        joinUrl,
        '',
        `Room code: ${room.code}`,
      ].join('\n');
      const result = await sendEmail({
        to: body.email,
        subject: `${senderInRoom.name} invited you to Snatch&GrabIt!`,
        text,
      });

      res.status(201).json({
        delivered: result.delivered,
        invite: invitePayload, // null if recipient is unknown to us
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0]?.message ?? 'Invalid invite',
          errors: error.errors,
        });
      }
      throw error;
    }
  });

  app.get("/api/invites", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(inviteManager.listFor(req.user!.id));
  });

  app.delete("/api/invites/:id", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    inviteManager.remove(req.user!.id, req.params.id);
    res.sendStatus(204);
  });

  const httpServer = createServer(app);

  return httpServer;
}
