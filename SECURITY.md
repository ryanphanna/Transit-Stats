# Security Model

This document outlines the security architecture and data protections for TransitStats.

## Authentication & Authorization

TransitStats uses a two-tier security model to enforce access control.

- **Whitelist (Invite-Only)**: Access is restricted to pre-registered users. This is enforced during account creation and every sign-in attempt.
- **Role-Based Access Control (RBAC)**: 
  - **Regular Users**: Track personal trips and manage profiles.
  - **Admins**: Access the Admin Panel to manage the stops database and monitor system health.

## Data Protections

### Database Security (Firestore Rules)
- **Isolation**: Users can only access their own data (trips, profiles, templates).
- **Public Reference Data**: The `stops` collection is globally readable but only modifiable by admins.
- **Sensitive State**: Infrastructure state (phone logs, rate limits) is restricted to server-side Admin SDK access only.

### Server-Side Security (Cloud Functions)
- **SMS Validation**: Incoming webhooks from Twilio are validated to prevent spoofing.
- **Rate Limiting**: Applied to all SMS processing to prevent abuse.
- **Secret Management**: API keys (Gemini, Twilio) are stored in Google Cloud Secret Manager via `defineSecret`.
- **API Key Restriction**: All frontend keys (Firebase, Google Maps) are strictly restricted in the Google Cloud Console to prevent unauthorized usage of costly APIs.

### Repository Security (GitHub)
- **Dependency Scanning**: Dependabot is enabled for automated detection and patching of vulnerable npm packages.
- **Static Testing**: CodeQL is configured to automatically scan the JavaScript codebase for common vulnerabilities on every push and pull request.

---

## Security Incidents

For history of security audits and incident remediation reports, please see **[INCIDENTS.md](./INCIDENTS.md)**.

## Reporting a Vulnerability

If you discover a security vulnerability, please do NOT open a public GitHub Issue. Instead, use the **Private Vulnerability Reporting** feature.
1. Go to the repository's **Security** tab.
2. Click **Vulnerability reporting**.
3. Click **Report a vulnerability**.

---

- [Admin Setup Guide](setup-admin.md)
- [README](./README.md)
