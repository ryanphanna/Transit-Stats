# TransitStats

Personal transit trip tracker for enthusiasts to analyze ridership patterns.

TransitStats is a web-based application to track, analyze, and visualize your public transit usage.

## 🚀 Key Features

### 🚌 Trip Tracking
- **Real-time Recording**: Start and end trips to capture routes (e.g., Bus 65, Line 1), stops, and duration.
- **GPS Mapping**: Capture boarding and alighting locations to unlock beautiful heatmaps (requires 50+ trips).
- **Active Trip Banner**: Always know when you have a trip in progress.
- **Recent Activity**: Quick access to your last 5 trips on the home page.

### ⚡ Efficiency Tools
- **Templates**: Save frequent route/stop combos for one-tap starts.
- **Auto-save**: Frequently used routes are automatically suggested as templates.
- **Repeat Last Trip**: One-click repeat for your most recent journey.
- **Swipe-to-Delete**: Intuitive touch gestures for managing your history on mobile.

### 📊 Analytics & Streaks
- **Personal Stats**: Track total trips, unique routes, total hours, and top stops/routes.
- **Riding Streaks**: Build daily streaks and track your all-time records with visual indicators.
- **Multi-Agency**: Badge support for TTC, OC Transpo, GO Transit, and many more.

### 📱 SMS Integration
Track trips without opening the app by texting the TransitStats number.
- **Format**: `Route / Stop / [Direction] / [Agency]`
- **Commands**: `STATUS`, `END`, `DISCARD`, `INFO`
- **Verification**: Trips are automatically verified against a community stop database.
- **Registration**: Text `REGISTER [email]` to link your phone via a verification code.

### 🌓 Modern Experience
- **Theme Support**: Seamless switching between Light and Dark modes.
- **Privacy First**: GPS is only captured when you explicitly start/end a trip; data is private to your account.
- **Device Sync**: Cloud sync via Firebase keeps your data available everywhere.

---

## 🛠️ Getting Started

1. Open the app and sign in via **Email Sign-in** (Password or Magic Link).
2. [Optional] Grant location permissions for mapping features.
3. Start tracking!

---

## 📄 Documentation & Links

- **[SECURITY.md](./SECURITY.md)** - Security model and access control.
- **[CHANGELOG.md](./CHANGELOG.md)** - Recent improvements and technical history.
- **[setup-admin.md](./setup-admin.md)** - Admin panel setup guide.
- **[migrations/](./migrations/)** - Database maintenance scripts.

---

## ⚖️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Happy Tracking! 🚌🚇🚊**
