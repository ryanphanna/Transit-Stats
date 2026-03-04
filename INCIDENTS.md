# Security Incidents

This document tracks historical security incidents and the remediation steps taken to resolve them.

---

## Credential Exposure Incident (March 2026)

During the v1.4.2 security audit, a `functions/.env.transitstats-21ba4` file containing live Twilio credentials was found to be tracked in git history.

**What was exposed:**
- `TWILIO_ACCOUNT_SID` (`ACd65b...458cd`)
- `TWILIO_PHONE_NUMBER` (`+1343•••0660`)

**Remediation Steps:**
1. **Credential Rotation**: A new Auth Token was generated in the Twilio Console.
2. **Secure Configuration**: The new token was stored using `firebase functions:config:set`.
3. **Redeployment**: Cloud Functions were redeployed with the latest security patches (v1.4.2).
4. **Git Hygiene**: `functions/.env` and `functions/.env.*` were added to `.gitignore`.

**Status: Resolved**
The credentials listed above are now inert. The Auth Token was rotated on March 4, 2026, rendering the exposed credentials invalid.
