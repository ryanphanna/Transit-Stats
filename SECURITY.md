# Security Model

## Authentication & Authorization

This application uses a two-tier security model:

### 1. Whitelist (Invite-Only Access)
- All users must be added to the `allowedUsers` collection in Firestore
- Users not on the whitelist cannot create accounts or sign in
- Enforced at both password and magic link authentication

### 2. Role-Based Access Control (Admin)
- Certain features (admin panel) require `isAdmin: true` flag
- Admin panel is used for managing stops and viewing all trips
- Regular users cannot access admin functionality

## Managing Users

### Adding a New User (Whitelist)

Use Firebase Console or Admin SDK to add to `allowedUsers` collection:

```javascript
// Document ID: user@example.com (lowercase)
{
  email: "user@example.com",
  isAdmin: false  // or true for admin access
}
```

**Important:** Email must be lowercase to match authentication checks.

### Granting Admin Access

Update existing user document:

```javascript
db.collection('allowedUsers').doc('user@example.com').update({
  isAdmin: true
});
```

### Revoking Access

Simply delete the user's document from `allowedUsers`:

```javascript
db.collection('allowedUsers').doc('user@example.com').delete();
```

Note: User will be signed out on next page load or auth state change.

## Security Rules

### Client-Side Security
- Firestore rules enforce all data access restrictions
- Stops collection is read-only from client (write via Admin SDK only)
- Users can only read/write their own trips, profiles, and templates
- Sensitive collections (phoneNumbers, smsState, rateLimits) are Admin SDK only

### Server-Side Security
- Cloud Functions validate all SMS webhook requests
- Rate limiting prevents abuse (500 msgs/hour per phone)
- Unknown number tracking prevents spam
- Idempotency checks prevent duplicate processing

## Data Model

### allowedUsers/{email}
```javascript
{
  email: string,        // User's email (lowercase)
  isAdmin: boolean      // Admin privileges flag
}
```

### profiles/{userId}
```javascript
{
  name: string,
  emoji: string,
  defaultAgency: string
}
```

### trips/{tripId}
```javascript
{
  userId: string,
  route: string,
  direction: string | null,
  startStopCode: string | null,
  startStopName: string | null,
  endStopCode: string | null,
  endStopName: string | null,
  startTime: Timestamp,
  endTime: Timestamp | null,
  source: 'sms' | 'web',
  verified: boolean,
  boardingLocation: { lat, lng } | null,
  exitLocation: { lat, lng } | null,
  agency: string,
  duration: number,
  timing_reliability: 'actual' | 'estimated',
  incomplete: boolean,
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | null,
  tags: string[],
  notes: string
}
```

### stops/{stopId}
```javascript
{
  name: string,
  code: string,
  agency: string,
  lat: number,
  lng: number,
  direction: string,
  aliases: string[]
}
```

## Best Practices

1. **Always use lowercase emails** when adding to allowedUsers
2. **Test with non-admin account** after making changes
3. **Backup Firestore** before bulk user operations
4. **Monitor rate limits** in production
5. **Review unknown numbers** periodically for spam
6. **Keep Admin SDK credentials secure** (never commit to git)

## Known Limitations

- Users can see who else is whitelisted (read access to allowedUsers)
- No automated user provisioning (must be done via Admin SDK)
- Admin role cannot be self-assigned (requires direct database access)

## Emergency Access Revocation

If you need to immediately revoke all access:

1. **Disable Authentication** in Firebase Console (Auth > Settings)
2. **Clear allowedUsers** collection
3. **Re-enable Authentication** and add only trusted users

This will sign out all users and prevent new sign-ins.
