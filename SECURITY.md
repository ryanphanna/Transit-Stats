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
- **Environment Isolation**: API keys (Gemini, Twilio) are stored in secure environment variables and are never exposed to the client or committed to the repository.

## Data Model (Security Critical)

### allowedUsers/{email}
*Used to verify authorization before allowing sign-in.*
- `email`: string (lowercase)
- `isAdmin`: boolean

### trips/{tripId}
*User-owned data; isolated by userId.*
- `userId`: string
- `boardingLocation/exitLocation`: GPS coordinates (captured only during active tracking)

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please open a GitHub Issue or contact the maintainer directly.
