# better-auth-loginllama

A [Better Auth](https://www.better-auth.com) plugin that scores every sign-in for
risk and refuses the dangerous ones before a session exists.

Better Auth checks the password. It does not ask whether the login looks right. A
correct password from a Tor exit node, a country the user has never been to, or a
bot that has just tried four thousand other accounts still gets a session. This
plugin asks [LoginLlama](https://loginllama.app) first.

```bash
npm install better-auth-loginllama
```

```ts
import { betterAuth } from 'better-auth';
import { loginLlama } from 'better-auth-loginllama';

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  plugins: [loginLlama()]
});
```

Set `LOGINLLAMA_API_KEY` in your environment. The free plan covers 1,000 sign-ins
a month: [get a key](https://loginllama.app/signup).

## What it does

On every email and password sign-in, before Better Auth creates the session, the
plugin sends the email, IP address and user agent to LoginLlama. It gets back a
score from 0 to 10 and reason codes such as `known_tor_exit_node`, `known_vpn`,
`impossible_travel_detected`, `new_login_location` and `known_bot`. At 8 or above the sign-in fails with a `403` and the
error code `LOGINLLAMA_RISKY_SIGN_IN`.

After the sign-in it reports whether the password was right. That is how
LoginLlama learns each user's usual devices and places, and why the scores get
sharper over time. Each attempt shows up in the
[dashboard](https://loginllama.app/account/dashboard) with its score and reasons.

If LoginLlama is down or takes longer than two seconds, the sign-in goes through.
A fraud check should never lock your users out.

## Options

```ts
loginLlama({
  apiKey: process.env.LOGINLLAMA_API_KEY, // the default
  blockAt: 8 // refuse at this score or above
});
```

Start at 8 and lower it once you have watched real scores for a week. LoginLlama
marks anything above 5 as risky.

## Show the error

```ts
const { error } = await authClient.signIn.email({ email, password });
if (error?.code === 'LOGINLLAMA_RISKY_SIGN_IN') {
  // Tell them why, and offer a password reset or support link.
}
```

## Requirements

Better Auth 1.6 or newer, Node 22.18 or newer. The plugin uses `fetch` and has no
other dependencies.

## Links

- [Full guide: login risk scoring for Better Auth](https://loginllama.app/blog/better-auth-login-risk-scoring)
- [LoginLlama docs](https://loginllama.app/docs)
- [Free IP reputation checker](https://loginllama.app/tools/ip-reputation-checker)

## Licence

MIT
