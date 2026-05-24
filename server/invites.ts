import { randomUUID } from "crypto";

const INVITE_TTL_MS = 1000 * 60 * 30; // 30 minutes

export interface PendingInvite {
  id: string;
  code: string;        // room code
  gameDbId: string;    // games.id (for reference / display)
  scoringMethod: string;
  targetScore: number;
  hostUserId: string | null;
  hostName: string;
  targetUserId: string;
  createdAt: number;
  expiresAt: number;
}

class InviteManager {
  private byUser = new Map<string, PendingInvite[]>();

  /** Add or refresh an invite. Duplicates against the same room + target are deduped. */
  add(input: {
    code: string;
    gameDbId: string;
    scoringMethod: string;
    targetScore: number;
    hostUserId: string | null;
    hostName: string;
    targetUserId: string;
  }): PendingInvite {
    const now = Date.now();
    const existing = (this.byUser.get(input.targetUserId) ?? []).find(
      (i) => i.code === input.code,
    );
    if (existing) {
      existing.createdAt = now;
      existing.expiresAt = now + INVITE_TTL_MS;
      existing.hostName = input.hostName;
      existing.hostUserId = input.hostUserId;
      return existing;
    }
    const invite: PendingInvite = {
      id: randomUUID(),
      code: input.code,
      gameDbId: input.gameDbId,
      scoringMethod: input.scoringMethod,
      targetScore: input.targetScore,
      hostUserId: input.hostUserId,
      hostName: input.hostName,
      targetUserId: input.targetUserId,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    };
    const list = this.byUser.get(input.targetUserId) ?? [];
    list.push(invite);
    this.byUser.set(input.targetUserId, list);
    return invite;
  }

  /** Return active invites for a user, evicting any expired ones. */
  listFor(userId: string): PendingInvite[] {
    const now = Date.now();
    const list = this.byUser.get(userId) ?? [];
    const fresh = list.filter((i) => i.expiresAt > now);
    if (fresh.length !== list.length) {
      if (fresh.length === 0) this.byUser.delete(userId);
      else this.byUser.set(userId, fresh);
    }
    return fresh;
  }

  /** Remove a specific invite (e.g. after the recipient joins or dismisses). */
  remove(userId: string, inviteId: string): void {
    const list = this.byUser.get(userId);
    if (!list) return;
    const next = list.filter((i) => i.id !== inviteId);
    if (next.length === 0) this.byUser.delete(userId);
    else this.byUser.set(userId, next);
  }

  /** Drop every invite for a given room code (called when a room is destroyed). */
  removeByRoomCode(code: string): void {
    Array.from(this.byUser.entries()).forEach(([userId, list]) => {
      const next = list.filter((i) => i.code !== code);
      if (next.length === 0) this.byUser.delete(userId);
      else this.byUser.set(userId, next);
    });
  }
}

export const inviteManager = new InviteManager();
