import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

export type LoginLlamaOptions = {
  /** Defaults to `process.env.LOGINLLAMA_API_KEY`. */
  apiKey?: string;
  /**
   * Refuse the sign-in at this score or above (0 to 10). LoginLlama calls
   * anything over 5 risky; 8 refuses only the clearest cases while you watch
   * real scores in the dashboard.
   */
  blockAt?: number;
};

type Outcome = 'pending' | 'success' | 'failed';
type LoginCheck = { risk_score: number; risk_codes: string[] };

const SIGN_IN = '/sign-in/email';
const CHECK_URL = 'https://loginllama.app/api/v1/login/check';

export const loginLlama = ({
  apiKey = process.env.LOGINLLAMA_API_KEY,
  blockAt = 8
}: LoginLlamaOptions = {}) => {
  if (!apiKey) {
    throw new Error(
      'better-auth-loginllama: set LOGINLLAMA_API_KEY or pass { apiKey }. Get a free key at https://loginllama.app/signup'
    );
  }

  // Fails open: an outage, on our side or yours, must never lock people out.
  async function check(
    email: string,
    headers: Headers | undefined,
    outcome: Outcome
  ): Promise<LoginCheck | null> {
    const response = await fetch(CHECK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.api+json',
        'X-API-KEY': apiKey!
      },
      body: JSON.stringify({
        identity_key: email,
        ip_address: headers?.get('x-forwarded-for')?.split(',')[0]?.trim(),
        user_agent: headers?.get('user-agent') ?? undefined,
        authentication_outcome: outcome
      }),
      signal: AbortSignal.timeout(2000)
    }).catch(() => null);

    if (!response?.ok) return null;
    return (await response.json()).data.attributes;
  }

  const isSignIn = (ctx: { path?: string }) => ctx.path === SIGN_IN;

  return {
    id: 'loginllama',
    hooks: {
      before: [
        {
          matcher: isSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const result = await check(ctx.body?.email, ctx.headers, 'pending');
            if (result && result.risk_score >= blockAt) {
              throw new APIError('FORBIDDEN', {
                message:
                  'This sign-in looks risky. Try again from a trusted device.',
                code: 'LOGINLLAMA_RISKY_SIGN_IN'
              });
            }
          })
        }
      ],
      // Reporting the outcome is how LoginLlama learns each user's usual
      // devices and places, so the next score is better.
      after: [
        {
          matcher: isSignIn,
          handler: createAuthMiddleware(async (ctx) => {
            const failed = ctx.context.returned instanceof APIError;
            await check(
              ctx.body?.email,
              ctx.headers,
              failed ? 'failed' : 'success'
            );
          })
        }
      ]
    }
  } satisfies BetterAuthPlugin;
};
