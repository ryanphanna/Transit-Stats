# Admin User Setup Guide

## First-Time Setup

When deploying Transit-Stats for the first time, you need to create at least one admin user.

### Option 1: Firebase Console (Easiest)

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `transitstats-21ba4`
3. Go to **Firestore Database**
4. Navigate to or create collection: `allowedUsers`
5. Click **Add document**
6. Set document ID to your email (lowercase): `your@email.com`
7. Add fields:
   - `email` (string): `your@email.com`
   - `isAdmin` (boolean): `true`
8. Click **Save**

### Option 2: Firebase CLI + Node.js Script

Create a file `add-admin.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addAdmin(email) {
  const emailLower = email.toLowerCase();

  await db.collection('allowedUsers').doc(emailLower).set({
    email: emailLower,
    isAdmin: true
  });

  console.log(`✅ Added admin: ${emailLower}`);
  process.exit(0);
}

// Usage: node add-admin.js your@email.com
const email = process.argv[2];
if (!email) {
  console.error('Usage: node add-admin.js <email>');
  process.exit(1);
}

addAdmin(email);
```

Run with:
```bash
node add-admin.js your@email.com
```

### Option 3: Cloud Functions Console

If you have deployed Cloud Functions, you can use the Firebase console shell:

1. Go to **Functions** in Firebase Console
2. Click on the **Shell** tab
3. Run:
```javascript
const admin = require('firebase-admin');
admin.firestore().collection('allowedUsers').doc('your@email.com').set({
  email: 'your@email.com',
  isAdmin: true
});
```

## Adding Regular Users (Non-Admin)

Use the same methods above, but set `isAdmin: false`:

```javascript
{
  email: 'user@example.com',
  isAdmin: false
}
```

Regular users can:
- Sign in to the main app
- Log trips via SMS or web
- View their own trip history
- Manage their profile

Regular users **cannot**:
- Access the admin panel
- Modify stops library
- View other users' data

## Promoting a User to Admin

Update existing user document:

**Firebase Console:**
1. Go to Firestore > `allowedUsers` > `user@example.com`
2. Edit field `isAdmin` to `true`
3. Save

**CLI Script:**
```javascript
await db.collection('allowedUsers').doc('user@example.com').update({
  isAdmin: true
});
```

## Removing Admin Access

Update to `isAdmin: false` or delete the user entirely from `allowedUsers`.

## Verification

After adding yourself as an admin:

1. Open the app: https://transitstats-21ba4.web.app/
2. Sign in with your email
3. You should see the main app interface
4. Open the admin panel: https://transitstats-21ba4.web.app/admin.html
5. You should see the admin interface (stops management)

If you're denied access:
- Check email is lowercase in Firestore
- Verify `isAdmin: true` is set
- Check browser console for errors
- Try signing out and back in

## Troubleshooting

### "Access denied. This app is invite-only."
- Your email is not in the `allowedUsers` collection
- Check spelling and lowercase formatting

### "Access denied. Admin privileges required."
- Your email is in `allowedUsers` but `isAdmin` is `false` or missing
- Update the document to set `isAdmin: true`

### Can't write to Firestore from client
- This is expected! Firestore rules prevent client-side writes
- Use Admin SDK (Cloud Functions, Firebase CLI) instead
- See Option 2 or 3 above

## Security Note

**Never commit service account keys to git!** Add to `.gitignore`:

```
serviceAccountKey.json
*-firebase-adminsdk-*.json
```

Download from Firebase Console > Project Settings > Service Accounts > Generate New Private Key
