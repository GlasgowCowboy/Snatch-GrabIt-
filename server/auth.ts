// From blueprint: javascript_auth_all_persistance
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { storage } from "./storage";
import { sendEmail, appUrl } from "./email";
import { User as SelectUser, insertUserSchema } from "@shared/schema";

// Tight limits for auth endpoints. Counted per IP. The login limiter is the
// brute-force backstop; register is also limited so abuse doesn't pollute the
// users table.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,                // 10 attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,                  // 5 accounts per IP per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many accounts created from this address. Try again later.' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { message: 'Too many password reset attempts. Try again later.' },
});

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret === 'dev-secret-change-in-production')) {
    throw new Error(
      'SESSION_SECRET must be set to a strong value in production. ' +
      'Generate one with `openssl rand -hex 32` and set it as an environment variable.',
    );
  }
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", registerLimiter, async (req, res, next) => {
    try {
      // Extract displayName before validation (it's not in the user schema)
      const { displayName, ...userData } = req.body;

      // Validate request body including password requirements
      const validatedData = insertUserSchema.parse(userData);

      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...validatedData,
        password: await hashPassword(validatedData.password),
      }, displayName);

      // Best-effort: kick off an email verification flow if the user gave an
      // address. Failure is non-fatal; the user can resend later from settings.
      if (user.email) {
        void sendVerificationEmail(user.id, user.username, user.email).catch((err) =>
          console.error('verification email failed:', err),
        );
      }

      req.login(user, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return next(err);
        }
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("Registration error:", error);
      // Zod validation surfaces here too — match the {message, errors} shape
      // used elsewhere so clients only ever have one error contract.
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: error.errors[0]?.message ?? "Invalid registration details",
          errors: error.errors,
        });
      }
      const detail = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: `Registration failed: ${detail}` });
    }
  });

  // Consume a verification link emailed to the user. GET so it works from any
  // mail client; redirects to the app with a one-time query flag.
  app.get("/api/verify-email", async (req, res) => {
    const token = String(req.query.token ?? '');
    if (!token) return res.redirect(`${appUrl()}/?verified=missing`);
    const row = await storage.getEmailVerificationToken(token);
    if (!row || new Date() > row.expiresAt) {
      if (row) await storage.deleteEmailVerificationToken(token);
      return res.redirect(`${appUrl()}/?verified=expired`);
    }
    await storage.markEmailVerified(row.userId);
    await storage.deleteEmailVerificationToken(token);
    res.redirect(`${appUrl()}/?verified=ok`);
  });

  // Resend a verification link for the currently logged-in user.
  app.post("/api/resend-verification", passwordResetLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.emailVerified) {
      return res.status(200).json({ message: 'Already verified' });
    }
    if (!req.user!.email) {
      return res.status(400).json({ message: 'No email on file for this account' });
    }
    await sendVerificationEmail(req.user!.id, req.user!.username, req.user!.email);
    res.status(200).json({ message: 'Verification email sent' });
  });

  async function sendVerificationEmail(userId: string, username: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await storage.createEmailVerificationToken({ userId, token, expiresAt });
    const link = `${appUrl()}/api/verify-email?token=${encodeURIComponent(token)}`;
    const text = [
      `Hi ${username},`,
      '',
      "Confirm your email to finish setting up your Snatch&GrabIt! account. This link expires in 24 hours.",
      '',
      link,
      '',
      "If you didn't sign up, you can ignore this — nothing will happen.",
    ].join('\n');
    await sendEmail({ to: email, subject: 'Verify your Snatch&GrabIt! email', text });
  }

  app.post("/api/login", loginLimiter, passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  app.post("/api/forgot-password", passwordResetLimiter, async (req, res) => {
    try {
      const { username } = req.body;

      const user = await storage.getUserByUsername(username);
      // Always return 200 so callers can't enumerate accounts by username.
      const okResponse = { message: "If an account with that username exists, a reset link has been emailed." };

      if (!user || !user.email) {
        // Either no such user, or the user has no email on file. Either way the
        // caller learns nothing — the response is identical.
        return res.status(200).json(okResponse);
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.createPasswordResetToken({ userId: user.id, token, expiresAt });

      const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      const text = [
        `Hi ${user.username},`,
        '',
        'We received a request to reset your Snatch&GrabIt! password. If this was you, follow the link below — it expires in 1 hour.',
        '',
        link,
        '',
        "If you didn't request this, you can ignore this email — your password won't change.",
      ].join('\n');
      // Don't await — failure to send email must not leak whether the user exists.
      void sendEmail({ to: user.email, subject: 'Reset your Snatch&GrabIt! password', text });

      res.status(200).json(okResponse);
    } catch (error) {
      console.error("Forgot password error:", error);
      // Still return the generic success message — otherwise a 500 reveals that
      // the username matched a real user (the not-found branch returns 200).
      res.status(200).json({ message: "If an account with that username exists, a reset link has been emailed." });
    }
  });

  app.post("/api/reset-password", passwordResetLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      if (new Date() > resetToken.expiresAt) {
        await storage.deletePasswordResetToken(token);
        return res.status(400).json({ message: "Token has expired" });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update user password
      await storage.updateUserPassword(resetToken.userId, hashedPassword);
      
      // Delete used token
      await storage.deletePasswordResetToken(token);

      res.status(200).json({ message: "Password reset successful" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });
}

export { hashPassword };
