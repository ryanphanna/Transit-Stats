# TransitStats

Personal transit trip tracker for transit nerds who want to analyze their ridership patterns.

## What it does

TransitStats is a web-based application that helps you track, analyze, and visualize your public transit usage. Whether you're a daily commuter or an occasional rider, TransitStats gives you insights into your travel patterns and helps you become more aware of your transit habits.

### Core Features

#### 🚌 Trip Tracking
- **Start and End Trips**: Record when you board and alight from transit vehicles
- **Route Information**: Track which routes/lines you use (e.g., Bus 65, Line 1, 504 King)
- **Stop Details**: Record boarding and alighting stops
- **Duration Tracking**: Automatically calculate trip duration
- **GPS Location**: Capture boarding and alighting locations for mapping (with permission)
- **Active Trip Banner**: See at-a-glance when you have a trip in progress

#### ⚡ Quick Start Features
- **Trip Templates**: Save frequently used route + stop combinations for one-tap trip starts
- **Repeat Last Trip**: Quickly start your commute with a single click
- **Auto-save Templates**: After using the same route/stop combo 3+ times, it's automatically saved as a template

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

**Community Comparison:**
- See your rank among all users
- Compare to community averages
- Track total user count

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
- **Recent Trips**: View your 20 most recent trips
- **Streak Stats**: Dedicated streak tracking section
- **Template Management**: Manage your saved trip templates
- **Swipe to Delete**: Easy trip and template deletion on touch devices

#### 🔐 Authentication & Sync
- **Email Sign-in**: Two authentication methods:
  - 🔑 **Password**: Traditional email/password login
  - ✨ **Magic Link**: Passwordless email link authentication
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

## Usage Tips

### Getting the Most Out of TransitStats
1. **Be Consistent**: Track every trip to build accurate patterns
2. **Use Templates**: Save your common routes for faster tracking
3. **Enable GPS**: Location data unlocks powerful mapping features
4. **Build Streaks**: Make it a game - how long can you ride transit daily?
5. **Check Stats**: Review your 30-day stats regularly to understand patterns

### Privacy Notes
- Your GPS location is only recorded when you explicitly start or end a trip
- All data is private to your account
- No data is shared with third parties
- You can delete individual trips at any time

## Features in Detail

### Streak Calculation
A streak is maintained when you take transit trips on consecutive days:
- Take a trip today and tomorrow = 2-day streak
- Miss a day = streak resets to 0
- Best streak ever is always remembered

### Template Auto-save
To reduce friction for frequent routes:
- Use the same route + starting stop combination 3 times
- TransitStats automatically saves it as a template
- Access it from the "Quick Start" section
- Delete templates you no longer need from your Profile

### Heatmap Unlock System
Progressive unlock encourages engagement:
- 0-49 trips: Progress bar with encouragement
- 50+ trips: Full heatmap unlocked
- All trip markers viewable before unlock
- Heatmap shows frequency-based visualization after unlock

## Contributing

This is a personal project, but suggestions and improvements are welcome! Please open an issue to discuss changes.

## License

This project is provided as-is for personal use.

## Acknowledgments

- Built with Firebase for authentication and data storage
- Maps powered by Leaflet.js and CartoDB
- Inspired by transit enthusiasts who love tracking their rides

---

**Happy Tracking! 🚌🚇🚊**
