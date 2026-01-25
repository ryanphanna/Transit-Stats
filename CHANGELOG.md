# Changelog

## Recent Technical Improvements

### Security Enhancements
- **Authentication Hardening**: Fixed whitelist bypass vulnerability in password authentication
- **Role-Based Access Control**: Added admin privilege verification for admin panel access
- **XSS Protection**: Implemented comprehensive HTML sanitization across all user-generated content
- **Input Validation**: Added validation for stop data, trip data, and user inputs
- **Firestore Rules**: Enhanced security rules with detailed data model documentation

### Reliability Improvements
- **Gemini Retry Logic**: Automatic retry with exponential backoff for AI parsing failures
- **Configuration Validation**: Cold-start validation of all required environment variables
- **Error Handling**: Improved error logging and user-friendly error messages

### Code Quality
- **Migration Scripts**: Added database migration tools for legacy field cleanup
- **Documentation**: Comprehensive security model and setup guides (see `SECURITY.md`, `setup-admin.md`)

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
