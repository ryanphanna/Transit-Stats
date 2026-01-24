# TransitStats

Personal transit trip tracker for transit enthusiasts who want to analyze their ridership patterns.

## What it does

TransitStats is a web-based application that helps you track, analyze, and visualize your public transit usage. Whether you're a daily commuter or an occasional rider, TransitStats gives you insights into your travel patterns and helps you become more aware of your transit habits.

### Core Features

#### 🚌 Trip Tracking
- **Start and End Trips**: Record when you board and alight from transit vehicles
- **Route Information**: Track which routes/lines you use (e.g., Bus 65, Line 1, 504 King)
- **Stop Details**: Record boarding and alighting stops
- **Duration Tracking**: Automatically calculate trip duration
- **GPS Location**: Capture boarding and alighting locations for mapping (with permission)
- **Active Trip Banner**: Clickable banner shows when you have a trip in progress - tap to jump to trip details
- **Recent Trips**: Home page displays your 5 most recent completed trips for quick reference

#### ⚡ Quick Start Features
- **Trip Templates**: Save frequently used route + stop combinations for one-tap trip starts
- **Repeat Last Trip**: One-click repeat for your last completed trip (not just templates)
- **Auto-save Templates**: After using the same route/stop combo 3+ times, it's automatically saved as a template
- **Manual Template Saving**: Checkbox option when ending trips to immediately save as a template

#### 📊 Statistics & Analytics
View your transit usage in two modes: **30 Days** or **All Time**

**Personal Stats:**
- Total trips taken
- Unique routes used
- Total hours traveled
- Unique stops visited
- Top 5 most-used routes
- Top 5 most-used stops

**Streak Tracking:**
- Current daily riding streak
- Best streak ever achieved
- Visual streak indicators



**Multi-Agency Support:**
- Set a default transit agency in your profile
- Agency badges appear on all trips showing which system you rode
- Track trips across multiple transit systems (TTC, OC Transpo, GO Transit, etc.)
- SMS logging supports agency specification

#### 🗺️ Heatmap Visualization
Unlock beautiful heatmaps after recording 50 trips with GPS data:

**Three View Modes:**
1. **Boarding Heatmap**: See where you most frequently board transit
2. **Alighting Heatmap**: See where you most frequently get off
3. **All Trips**: View individual trip markers on the map

**Stop Intensity Levels:**
- 🔵 **Home Base** (50%+ of usage) - Dark blue - Your primary stop
- 🔵 **Regular** (25-49% of usage) - Medium blue - Frequently used stops
- 🔵 **Occasional** (10-24% of usage) - Light blue - Sometimes used stops
- 🔵 **Rare** (5-9% of usage) - Very light blue - Infrequently used stops

**Progress Tracking:**
- Visual progress bar showing how close you are to unlocking heatmaps
- Map statistics showing GPS coverage and journey completeness

#### 👤 Profile Management
- **Custom Avatar**: Choose from 8 transit-themed emojis (🚌 🚇 🚊 🚋 🚞 🚝 🚄 ✈️)
- **Name Display**: Personalize your profile
- **Default Agency**: Set your primary transit agency (TTC, OC Transpo, GO Transit, etc.)
- **Recent Trips**: View your 20 most recent trips
- **Streak Stats**: Dedicated streak tracking section
- **Template Management**: Manage your saved trip templates
- **Swipe to Delete**: Touch gesture support for easy deletion of trips and templates on mobile devices
- **Swipe to Delete**: Touch gesture support for easy deletion of trips and templates on mobile devices

#### 🔐 Authentication & Sync
- **Email Sign-in**: Two authentication methods:
  - 🔑 **Password**: Traditional email/password login (automatically creates account for new users)
  - ✨ **Magic Link**: Passwordless email link authentication
- **Invite-Only Access**: Application uses a whitelist system (`allowedUsers` collection) for controlled access
- **Cloud Sync**: All your data syncs across devices via Firebase
- **Secure**: Your data is protected and private

#### 🌓 Theme Support
- **Light Mode**: Clean, bright interface
- **Dark Mode**: Easy on the eyes for night riding
- **Persistent**: Your theme choice is saved

#### 📍 Location Services
- **GPS Tracking**: Optional location capture for boarding and alighting
- **Privacy-Focused**: Location is only captured when you start/end trips
- **Status Indicator**: Always know your location service status

#### 📱 SMS Integration
TransitStats includes a complete SMS-based trip logging system for tracking trips on-the-go without opening the app:

**SMS Trip Logging:**
- Send multi-line text messages to log trips via SMS
- Format: Route / Stop / Direction (optional) / Agency (optional)
- Commands: STATUS (view active trip), END (finish trip), DISCARD (delete trip), INFO (show help)

**Smart Features:**
- **Direction Normalization**: "SB" -> "Southbound", "CW" -> "Clockwise"
- **Alias Resolution**: Text "Home" or "Work" (if configured in Admin) to map to specific stops
- **Auto-Formatting**: "king and spadina" -> "King & Spadina"

**Verification System:**
- **Verified Badge (✓)**: Trips where stops are found in the stop database with GPS coordinates
- **Unverified Badge (?)**: Trips with stops not yet in the database

**Admin Panel:**
- Users can manage the stop database via the hidden Admin Panel (`/admin.html`)
- **Link Aliases**: Map common names (e.g., "King & Spadina") to canonical Stop IDs
- **Stop Management**: create, edit, and verify stops to improve data quality 

**Registration:**
- Link your phone number to your TransitStats account via SMS
- Text REGISTER [email] to begin the verification process
- Receive a 4-digit code via email to complete linking

**Supported Agencies:**
- TTC, OC Transpo, GO Transit, MiWay, YRT, Brampton Transit, Durham Transit, HSR, GRT, STM, TransLink, and more

## Technical Details

### Technology Stack
- **Frontend**: Pure HTML, CSS, and JavaScript (no framework dependencies)
- **Backend**: Firebase (Authentication, Firestore Database)
- **Maps**: Leaflet.js with CartoDB Light tiles
- **Responsive Design**: Works on desktop, tablet, and mobile

### Browser Requirements
- Modern web browser with JavaScript enabled
- GPS/Location services (optional, for mapping features)
- Internet connection for sync

### Data Storage
- **Cloud**: Trips, profiles, and templates stored in Firestore
- **Local**: Theme preferences and template usage counts in localStorage

## Getting Started

### For Users
1. Open the application in your web browser
2. Sign in with your email (password or magic link)
3. Grant location permissions (optional, but recommended for maps)
4. Start tracking your first trip!

### For Developers
1. Clone this repository
2. Update Firebase configuration in the `<script>` section of `index.html` (search for `firebaseConfig`)
3. Set up Firebase Authentication and Firestore
4. Open `index.html` in a web browser or deploy to a hosting service

### Firebase Setup
You'll need:
- Firebase Authentication (Email/Password and Email Link enabled)
- Firestore Database with the following collections:
  - `profiles`: User profile data
  - `trips`: Trip records
  - `templates`: Saved trip templates
  - `allowedUsers`: Whitelist for invite-only access
  - `stops`: Community-contributed stop database (for SMS verification)
  - `phoneNumbers`: SMS phone number to user mappings
  - `smsState`: Temporary state for SMS workflows
  - `smsVerification`: SMS registration verification codes

## Usage Tips

### Getting the Most Out of TransitStats
1. **Be Consistent**: Track every trip to build accurate patterns
2. **Use Templates**: Save your common routes for faster tracking
3. **Try SMS Logging**: Track trips hands-free via text message
4. **Set Your Agency**: Configure your default transit agency in your profile
5. **Enable GPS**: Location data unlocks powerful mapping features
6. **Build Streaks**: Make it a game - how long can you ride transit daily?
7. **Check Stats**: Review your 30-day stats regularly to understand patterns
8. **Verify SMS Trips**: Use the Admin Panel to keep your stop library clean

### Privacy Notes
- Your GPS location is only recorded when you explicitly start or end a trip
- All data is private to your account
- No data is shared with third parties
- You can delete individual trips at any time
- SMS messages are processed securely and phone numbers are stored only for account linking
- Stop database contributions are anonymized and used only for trip verification

## Features in Detail

### Streak Calculation
A streak is maintained when you take transit trips on consecutive days:
- Take a trip today and tomorrow = 2-day streak
- Miss a day = streak resets to 0
- Best streak ever is always remembered

### Template Auto-save
To reduce friction for frequent routes:
- **Automatic**: Use the same route + starting stop combination 3 times and it's automatically saved as a template
- **Manual**: Check the "⭐ Save route + start stop as template" box when ending any trip to immediately save it
- Access saved templates from the "Quick Start" section
- Delete templates you no longer need from your Profile

### Heatmap Unlock System
Progressive unlock encourages engagement:
- 0-49 trips: Progress bar with encouragement
- 50+ trips: Full heatmap unlocked
- All trip markers viewable before unlock
- Heatmap shows frequency-based visualization after unlock

### User Interface Features

**Interactive Banners:**
- **Active Trip Banner**: Clickable banner at the top shows your current trip - tap to jump to trip details
- **Streak Banner**: Displays your current riding streak on the home page
- **Grid Layout**: Responsive design adapts to desktop screens with banner grid

**Touch Gestures:**
- **Swipe-to-Delete**: Swipe left or right on trips and templates to reveal delete option
- Works seamlessly on mobile and touch-enabled devices

**Recent Trips Display:**
- **Home Page**: Shows 5 most recent completed trips for quick access
- **Profile Page**: Full history with 20 most recent trips
- Different views for different contexts

### SMS Trip Logging

Track trips without opening the app by sending text messages:

**Getting Started:**
1. Text `REGISTER [your-email]` to the TransitStats number
2. Receive a 4-digit verification code via email
3. Reply with the code to link your phone

**Starting a Trip:**
Send a multi-line message with:
```
[Route number/name]
[Stop code or name]
[Direction] (optional)
[Agency] (optional)
```

Example:
```
65
6036
Eastbound
OC Transpo
```

**Ending a Trip:**
Send:
```
END
[Route]
[Exit stop]
```

**Other Commands:**
- `STATUS` - View your active trip details
- `DISCARD` - Delete the current active trip
- `INFO` or `?` - Show help message

**Trip Verification:**
- Trips are marked as **Verified (✓)** when stops are found in the database
- **Unverified (?)** trips appear in the "Review SMS Trips" section
- You can add missing stops to the database to verify trips retroactively
- Adding stops contributes to the community database and helps verify future trips

## Contributing

This is a personal project, but suggestions and improvements are welcome! Please open an issue to discuss changes.

## License

This project is provided as-is for personal use.

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

See commit history for detailed changelog of improvements.

## Developer Documentation

### Additional Documentation

- **[SECURITY.md](./SECURITY.md)** - Complete security model, user management, and best practices
- **[setup-admin.md](./setup-admin.md)** - Step-by-step guide for creating and managing admin users
- **[migrations/README.md](./migrations/README.md)** - Database migration scripts and instructions

### Code Architecture

**Frontend (app.js, admin.js)**
- No framework dependencies for maximum portability
- Direct Firebase SDK integration
- Event-driven architecture
- Client-side rendering with template literals

**Backend (Cloud Functions)**
- Express.js HTTP handlers
- Twilio webhook processing
- Google Gemini AI integration
- Firestore transaction management
- Rate limiting and idempotency

**Security Model**
- Two-tier authentication (whitelist + role-based)
- Client-side: Firestore security rules
- Server-side: Admin SDK with rate limiting
- All user input sanitized before rendering

### Testing

Currently no automated tests. Recommended areas for testing:
- SMS parsing logic (heuristic and AI)
- Trip verification workflows
- Stop lookup with aliases
- Authentication and authorization flows

### Known Technical Debt

- Multiple field formats for backwards compatibility (`startStop` vs `startStopCode`/`startStopName`)
- Stops library loaded entirely into memory (use migration script to optimize)
- No test coverage
- Some inconsistent error handling patterns

See [migrations/](./migrations/) for scripts to address technical debt.

## Troubleshooting

### Common Issues

**"Access denied. This app is invite-only."**
- Your email is not in the `allowedUsers` Firestore collection
- Contact the admin to be added to the whitelist

**"Access denied. Admin privileges required."**
- You need `isAdmin: true` in your `allowedUsers` document
- Regular users cannot access `/admin.html`

**SMS messages not working**
- Check Cloud Functions logs in Firebase Console
- Verify Twilio webhook URL is correct
- Ensure `functions:config` is set for Twilio and Gemini
- Check rate limits (500 msgs/hour per phone)

**Heatmap not loading**
- Need 50+ trips with GPS data
- Check browser console for errors
- Verify location permissions are granted

**Trips not syncing**
- Check internet connection
- Verify you're signed in
- Check Firestore rules in Firebase Console
- Review browser console for authentication errors

## Performance Considerations

- Infinite scroll pagination for trip history (20 trips per batch)
- Lazy loading of map tiles
- Client-side caching of stops library
- Optimistic UI updates for better perceived performance

For large datasets (10,000+ trips), consider:
- Running migration scripts to normalize data
- Implementing server-side pagination
- Adding Firestore composite indexes
- Using Cloud Storage for data exports

## Acknowledgments

- Built with Firebase for authentication and data storage
- Maps powered by Leaflet.js and CartoDB
- AI parsing by Google Gemini 2.0 Flash
- SMS integration via Twilio
- Inspired by transit enthusiasts who love tracking their rides

---

**Happy Tracking! 🚌🚇🚊**
