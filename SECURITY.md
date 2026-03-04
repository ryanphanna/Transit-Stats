# Security Model

This document outlines the security architecture and data protections for TransitStats. For operational instructions on managing users and admins, please refer to the **[Admin Setup Guide](setup-admin.md)**.

## Authentication & Authorization

TransitStats uses a two-tier security model to protect user data and prevent unauthorized usage.

### 1. Whitelist (Invite-Only Access)
The application is strictly invite-only. To gain access, a user's email must be pre-registered in the system. This is enforced during account creation and every sign-in attempt.

### 2. Role-Based Access Control (RBAC)
User permissions are divided into two levels:
- **Regular Users**: Can track their own trips, manage their profile, and use SMS integration.
- **Admins**: Have additional access to the Admin Panel for managing the stops database and overseeing system health.

## Data Protections

### Client-Side Security (Firestore Rules)
Security is enforced at the database level using Firestore Rules:
- **Isolation**: Users can only read and write their own data (trips, profiles, templates).
- **Public Reference Data**: The `stops` collection is globally readable but can only be modified by administrators via the Admin SDK.
- **Sensitive Data**: Collections containing infrastructure state (phone numbers, SMS logs, rate limits) are restricted—only accessible by the server-side Admin SDK.

### Server-Side Security (Cloud Functions)
- **SMS Security**: All incoming webhooks from Twilio are validated to prevent spoofing.
- **Rate Limiting**: Automatic rate limiting is applied to SMS processing to prevent abuse.
- **Secret Management**: API keys for sensitive services (Gemini, Twilio) are stored in Google Cloud Secret Manager. On the server side, they are accessed via `defineSecret` and never exposed via environment variables or hardcoded in source.
- **API Restriction**: Frontend API keys (Firebase, Google Maps) must be strictly restricted in the Google Cloud Console to only the specific services they require. This prevents leaked keys from being used to access costly APIs like Gemini (Generative Language API).

## Data Model (Security Critical)

### allowedUsers/{email}
*Used to verify authorization before allowing sign-in.*
- `email`: string (lowercase)
- `isAdmin`: boolean

### trips/{tripId}
*User-owned data; isolated by userId.*
- `userId`: string
- `boardingLocation/exitLocation`: GPS coordinates (captured only during active tracking)

## Gemini API Key Security

Following the guidance from [TruffleSecurity](https://trufflesecurity.com/blog/google-api-keys-werent-secrets-but-then-gemini-changed-the-rules), we have audited our API key usage:

1. **Server-Side Integration**: Our Gemini integration is now moved to use Firebase Secrets Manager (`defineSecret`). This ensures the key is protected in TransitStats' GCP infrastructure and is not public.
2. **Client-Side Risks**: Because legacy Google API keys (like those used for Firebase) can now gain Gemini access automatically if the "Generative Language API" is enabled, **it is CRITICAL that any frontend API keys be restricted to only Firebase/Firestore services.**
3. **Audit Rule**: Never enable "Generative Language API" in a GCP project that uses unrestricted API keys in a public or client-side application.

## Credential Exposure Incident (March 2026)

During the v1.4.2 security audit, a `functions/.env.transitstats-21ba4` file containing live Twilio credentials was found to be tracked in git history.

**What was exposed:**
- `TWILIO_ACCOUNT_SID` (Account SID `ACd65b7ea0ab0bc98a24e5a805de6458cd`)
- `TWILIO_PHONE_NUMBER` (+13433160660)

**What was fixed (already done):**
- `functions/.env` and `functions/.env.*` added to `.gitignore` to prevent future commits.

**Status: Remediation Complete**

The credentials above are now inert. The Auth Token was rotated on March 4, 2026, and the system was redeployed with the new secure configuration.

The following actions were taken to secure the system after the credential exposure was identified:

1. **Credential Rotation**: A new Auth Token was generated in the Twilio Console for Account SID `ACd65b7ea0ab0bc98a24e5a805de6458cd`.
2. **Secure Configuration**: The new token was stored using `firebase functions:config:set` to ensure it is handled as a secret by the production environment.
3. **Redeployment**: The Cloud Functions were redeployed with the latest security patches (v1.4.2) and the new secure configuration.

This process rendered the exposed credentials in git history inert, as they no longer have a valid Auth Token associated with them.

### Historical Data Persistence

While the active credentials have been rotated and the system is secure, the original exposed `.env` file remains in the project's git history. Organizations requiring strict compliance (e.g., zero-tolerance for secrets in history) may choose to perform a history purge using tools like `git-filter-repo`.

However, because the credentials themselves are now invalid (revoked at the source), this history purge is considered a secondary cleanup step. It was identified as an optional measure during the March 2026 audit, as it requires a repository-wide force push and coordination with all collaborators.

---

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please open a GitHub Issue or contact the maintainer directly.
