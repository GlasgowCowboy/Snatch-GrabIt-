import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { registerRoutes } from '../routes';
import { storage } from '../storage';
import { MemoryStorage } from '../storage-memory';

/**
 * Reach into MemoryStorage to find the most recent password-reset token for a
 * user — emulates what a real email recipient would have received now that the
 * forgot-password endpoint no longer leaks the token in the response.
 */
function mostRecentResetTokenForUser(username: string): string | undefined {
  if (!(storage instanceof MemoryStorage)) {
    throw new Error('Test requires MemoryStorage');
  }
  const users = (storage as MemoryStorage)['users'] as Map<string, { id: string; username: string }>;
  const user = Array.from(users.values()).find((u) => u.username === username);
  if (!user) return undefined;
  const tokens = (storage as MemoryStorage)['resetTokens'] as Map<string, { userId: string; token: string; createdAt: Date }>;
  const candidates = Array.from(tokens.values()).filter((t) => t.userId === user.id);
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return candidates[0]?.token;
}

let httpServer: HttpServer;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
});

/** Minimal cookie jar so sessions persist across requests within a test. */
function makeSession() {
  let cookie = '';
  return {
    async fetch(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('cookie', cookie);
      if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      if (setCookies.length > 0) {
        cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      }
      return res;
    },
    get cookie() {
      return cookie;
    },
  };
}

function uniqueUsername(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const STRONG_PASSWORD = 'P@ssword123';

async function registerJSON(
  session: ReturnType<typeof makeSession>,
  body: Record<string, unknown>,
) {
  const res = await session.fetch('/api/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

describe('Auth REST integration', () => {
  it('POST /api/register creates a user, logs them in, and returns the user record', async () => {
    const session = makeSession();
    const username = uniqueUsername('alice');
    const { status, body } = await registerJSON(session, {
      username,
      password: STRONG_PASSWORD,
      email: null,
      displayName: 'Alice',
    });
    expect(status).toBe(201);
    const user = JSON.parse(body) as { id: string; username: string; password: string };
    expect(user.username).toBe(username);
    expect(user.id).toBeTypeOf('string');

    // After registration the session should be authenticated.
    const me = await session.fetch('/api/user');
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { username: string };
    expect(meBody.username).toBe(username);
  });

  it('POST /api/register rejects a duplicate username', async () => {
    const session = makeSession();
    const username = uniqueUsername('dupe');
    const first = await registerJSON(session, {
      username,
      password: STRONG_PASSWORD,
      email: null,
    });
    expect(first.status).toBe(201);

    const second = await registerJSON(makeSession(), {
      username,
      password: STRONG_PASSWORD,
      email: null,
    });
    expect(second.status).toBe(400);
    expect(second.body).toMatch(/already exists/i);
  });

  it('POST /api/register rejects a password that does not meet complexity rules', async () => {
    const session = makeSession();
    // Missing capital letter, number, and special char.
    const res = await registerJSON(session, {
      username: uniqueUsername('weak'),
      password: 'lowercase',
      email: null,
    });
    // Zod validation surfaces as 400 with `{ message, errors }` — the same shape
    // every other validated endpoint uses, so the client only has one contract.
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body) as { message: string; errors?: unknown };
    expect(body.message).toMatch(/password/i);
  });

  it('GET /api/user returns 401 when not logged in', async () => {
    const session = makeSession();
    const res = await session.fetch('/api/user');
    expect(res.status).toBe(401);
  });

  it('POST /api/login authenticates and POST /api/logout clears the session', async () => {
    const username = uniqueUsername('roundtrip');
    // Register on a throwaway session — that session is logged in, but we want to test login.
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: null });

    const session = makeSession();
    const login = await session.fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: STRONG_PASSWORD }),
    });
    expect(login.status).toBe(200);

    const me = await session.fetch('/api/user');
    expect(me.status).toBe(200);

    const logout = await session.fetch('/api/logout', { method: 'POST' });
    expect(logout.status).toBe(200);

    const afterLogout = await session.fetch('/api/user');
    expect(afterLogout.status).toBe(401);
  });

  it('POST /api/login returns 401 for wrong password', async () => {
    const username = uniqueUsername('badpass');
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: null });

    const res = await makeSession().fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: 'WrongPassword1!' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/forgot-password does not reveal whether the user exists', async () => {
    // Real user with an email — returns the generic success message, no token.
    const username = uniqueUsername('forgot');
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: `${username}@example.com` });

    const real = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    expect(real.status).toBe(200);
    const realBody = (await real.json()) as { token?: string; message: string };
    expect(realBody.token).toBeUndefined();
    expect(realBody.message).toMatch(/reset link/i);

    // Unknown user — identical response shape so a probe can't tell them apart.
    const fake = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username: 'nobody-here-' + Date.now() }),
    });
    expect(fake.status).toBe(200);
    const fakeBody = (await fake.json()) as { token?: string; message: string };
    expect(fakeBody.token).toBeUndefined();
    expect(fakeBody.message).toBe(realBody.message); // bit-for-bit identical
  });

  it('POST /api/reset-password lets a user log in with the new password (end-to-end)', async () => {
    const username = uniqueUsername('reset');
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: `${username}@example.com` });

    // Trigger a reset email (in test mode the email is console-logged; we
    // fetch the token directly from storage to simulate clicking the link).
    const forgot = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    expect(forgot.status).toBe(200);
    const token = mostRecentResetTokenForUser(username);
    expect(token).toBeTypeOf('string');

    // Reset to a new password.
    const NEW_PASSWORD = 'NewP@ss456';
    const reset = await makeSession().fetch('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: NEW_PASSWORD }),
    });
    expect(reset.status).toBe(200);

    // Old password should no longer work.
    const oldLogin = await makeSession().fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: STRONG_PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await makeSession().fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: NEW_PASSWORD }),
    });
    expect(newLogin.status).toBe(200);

    // The token must be single-use — reusing it returns 400.
    const reuse = await makeSession().fetch('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword: 'Another1!' }),
    });
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).message).toMatch(/invalid|expired/i);
  });

  it('POST /api/reset-password rejects an unknown token with 400', async () => {
    const res = await makeSession().fetch('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'not-a-real-token', newPassword: 'Whatever1!' }),
    });
    expect(res.status).toBe(400);
  });
});
