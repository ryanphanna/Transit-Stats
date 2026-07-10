# Terms of Service

**This is a starting point, not legal advice.** These terms are self-drafted for a small personal project. If Transit Stats ever takes on paying customers at scale, opens up beyond invite-only access, or otherwise carries real legal/liability exposure, have an actual lawyer review this before relying on it.

Last updated: July 2026.

## What this is

Transit Stats is an invite-only, personal transit trip tracker. You log trips by SMS or the companion app; the service records your rides and shows you stats and predictions about them. It is provided as-is, free of charge, at the operator's discretion — there is no paid subscription or billing system today, and "premium" features are enabled manually by the operator, not purchased.

## Acceptable use

You agree not to:
- Send spam, abusive content, or automated/bulk messages to the service's SMS number or API endpoints
- Attempt to access another user's account, trips, or data
- Attempt to circumvent the invite-only whitelist or rate limits
- Attempt to gain unauthorized access to Transit Stats' systems, infrastructure, source code repositories, or backend services — including exploiting, probing, or attacking security vulnerabilities — except as part of the good-faith responsible disclosure process described in [SECURITY.md](./SECURITY.md)
- Misuse the service's AI features (stop-sign photo parsing, natural-language stats queries): no prompt injection or jailbreak attempts, no trying to extract underlying prompts/instructions, and no using them for anything unrelated to your own trip logging and stats — including generating harmful, illegal, or abusive content
- Use the service in any way that disrupts it for other users or the operator's Twilio/Gemini/Firebase usage quotas and costs

Violating this may result in your phone number or account being rate-limited, suspended, or permanently blocked, without notice, and may be reported to relevant authorities where applicable.

## SMS terms

By registering your phone number, you consent to receive SMS/MMS messages from Transit Stats related to your trip logging (trip confirmations, prompts, verification codes, and replies to your messages). Message and data rates may apply from your carrier.

- Reply **STOP** at any time to stop receiving messages. This unregisters your number from the service.
- Reply **HELP** for assistance, or text **INFO** for the current command list.
- This is not a marketing list — no promotional messages are sent.

## What data is collected

See [SECURITY.md](./SECURITY.md) for the full technical breakdown. In summary: trip data (routes, stops, timestamps, and GPS coordinates at trip start/end) tied to your account; your phone number and email for authentication; and, for premium AI-query users, trip data is sent to Google Gemini to answer natural-language questions (never used to train Google's models — see SECURITY.md for the specific privacy commitment). Stop-sign photos sent by MMS are processed in memory and never stored. Third-party services used to operate Transit Stats: Twilio (SMS/MMS), Google Gemini (AI parsing/queries), Google Firebase (auth, database, hosting, functions), and [Atlas](https://github.com/Civic-Minds/Atlas) (public, read-only route/stop data — no user data is ever sent to it).

## Your data

You can request deletion of your account and trip data at any time by contacting the operator. Public Profiles (if you opt in) expose only aggregate stats (trip/hour totals, an anonymized location heatmap) — never individual trip details, routes, or timestamps.

## No warranty

Transit Stats is provided "as is." Predictions, stop matching, and trip data may be inaccurate. The operator makes no guarantee of uptime, data retention, or fitness for any particular purpose. Do not rely on this app for anything safety-critical.

## Changes

These terms may change at any time. Continued use after a change means you accept the update.

## Contact

Report abuse, request data deletion, or ask questions via [GitHub Issues](https://github.com/ryanphanna/Transit-Stats/issues) or the contact method the operator has given you directly.
