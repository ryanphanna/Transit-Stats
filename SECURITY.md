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

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please open a GitHub Issue or contact the maintainer directly.
