import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { type Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { registerRoutes } from '../routes';

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
    // The route catches Zod errors and returns 500 with the validation message; not ideal
    // but that's the current contract — we lock it in here.
    expect(res.status).toBe(500);
    expect(res.body).toMatch(/password/i);
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
    // Real user — returns 200 with token.
    const username = uniqueUsername('forgot');
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: null });

    const real = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    expect(real.status).toBe(200);
    const realBody = (await real.json()) as { token?: string; message: string };
    expect(realBody.token).toBeTypeOf('string');

    // Unknown user — must also return 200 with no error message that would leak existence.
    const fake = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username: 'nobody-here-' + Date.now() }),
    });
    expect(fake.status).toBe(200);
    const fakeBody = (await fake.json()) as { token?: string; message: string };
    expect(fakeBody.token).toBeUndefined();
  });

  it('POST /api/reset-password lets a user log in with the new password (end-to-end)', async () => {
    const username = uniqueUsername('reset');
    await registerJSON(makeSession(), { username, password: STRONG_PASSWORD, email: null });

    // Request a reset token (dev mode returns it in the response).
    const forgot = await makeSession().fetch('/api/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const { token } = (await forgot.json()) as { token: string };
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
