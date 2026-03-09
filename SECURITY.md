# Security Model

TransitStats is built with privacy and security as its foundation.

- **Authentication & Authorization**: A multi-tier model using invite-only whitelists and role-based access control (RBAC).
- **Data Ownership**: Firestore rules ensure users only access their own trips, profiles, and templates.
- **AI Privacy**: TransitStats uses Gemini to interpret and process location-based trip data.
    - **Privacy Commitment**: Covered by [Google's Enterprise Privacy protections](https://cloud.google.com/vertex-ai/docs/generative-ai/learn/privacy).
    - **No Training**: Your trip data is never used to train global AI models.
    - **Isolation**: Data is processed in isolated sessions and is not shared with other users.
- **Secure Integration**: Server-side validation, rate limiting, and secure secret management via Google Cloud.
- **Automated Scanning**: Continuous monitoring via Dependabot and CodeQL for potential vulnerabilities.

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

If you discover a security vulnerability in this project, please report it via the **[GitHub Private Vulnerability Reporting](https://github.com/TransitStats/TransitStats/security/advisories/new)** tool. Private reports allow for a secure disclosure process before a formal patch is released.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Resolution**: Depends on severity and complexity
