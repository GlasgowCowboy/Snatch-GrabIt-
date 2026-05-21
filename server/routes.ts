import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { roomManager, RoomError } from "./rooms";
import { gameSocket } from "./gameSocket";
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

  // Game history routes (only for paid users)
  app.get("/api/games/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    if (req.user!.tier !== 'paid') {
      return res.status(403).json({ message: "Upgrade to paid account to access game history" });
    }
    
    const games = await storage.getUserGames(req.user!.id);
    res.json(games);
  });

  // Virtual betting routes (entertainment only - no real-world value)
  app.get("/api/betting/balance", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const balance = await storage.getUserChipBalance(req.user!.id);
    res.json({ chips: balance });
  });

  app.post("/api/betting/place", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const betSchema = z.object({
        gameId: z.string(),
        betType: z.enum(['winner', 'declareOut', 'confidence', 'sidebet']),
        targetUserId: z.string().optional(),
        targetPlayerName: z.string().optional(),
        chipAmount: z.number().min(1),
      }).refine((data) => {
        // For non-confidence bets, targetUserId is required
        if (data.betType !== 'confidence' && !data.targetUserId) {
          return false;
        }
        return true;
      }, {
        message: "Target player is required for non-confidence bets",
      });
      
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
  app.post("/api/rooms", async (req, res) => {
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
      res.json({ room: room ?? null });
    } catch (error) {
      handleRoomError(error, res);
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
