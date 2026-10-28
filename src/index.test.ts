import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { loginLlama } from './index.ts';

// Stands in for the LoginLlama API: answers with `score`, records each call.
let score = 0;
let calls: { authentication_outcome: string; ip_address?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith('https://loginllama.app/')) {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({
      data: { attributes: { risk_score: score, risk_codes: [] } }
    });
  }
  return realFetch(input, init);
};

const auth = betterAuth({
  secret: 'test-secret-that-is-long-enough-for-better-auth',
  baseURL: 'http://localhost:3000',
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  emailAndPassword: { enabled: true },
  plugins: [loginLlama({ apiKey: 'test-key' })]
});

const credentials = { email: 'ada@example.test', password: 'correct-horse-battery' };
await auth.api.signUpEmail({ body: { ...credentials, name: 'Ada' } });

// Through the HTTP handler, so each test sees what a browser would.
const signIn = (password = credentials.password) =>
  auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.7, 10.0.0.1'
      },
      body: JSON.stringify({ email: credentials.email, password })
    })
  );

beforeEach(() => {
  score = 0;
  calls = [];
});

test('lets a low-risk sign-in through and reports success', async () => {
  const response = await signIn();
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((c) => c.authentication_outcome),
    ['pending', 'success']
  );
  assert.equal(calls[0].ip_address, '203.0.113.7');
});

test('refuses a sign-in at the block threshold', async () => {
  score = 8;
  const response = await signIn();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'LOGINLLAMA_RISKY_SIGN_IN');
});

test('reports a wrong password as failed', async () => {
  const response = await signIn('wrong-password');
  assert.equal(response.status, 401);
  assert.deepEqual(
    calls.map((c) => c.authentication_outcome),
    ['pending', 'failed']
  );
});

test('fails open when LoginLlama is unreachable', async () => {
  const mocked = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    assert.equal((await signIn()).status, 200);
  } finally {
    globalThis.fetch = mocked;
  }
});

test('refuses to start without an API key', () => {
  const saved = process.env.LOGINLLAMA_API_KEY;
  delete process.env.LOGINLLAMA_API_KEY;
  try {
    assert.throws(() => loginLlama(), /LOGINLLAMA_API_KEY/);
  } finally {
    if (saved) process.env.LOGINLLAMA_API_KEY = saved;
  }
});
