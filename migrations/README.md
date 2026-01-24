# Database Migrations

This directory contains database migration scripts for Transit-Stats.

## Available Migrations

### `add-isAdmin-field.js` ⚡ **RUN THIS FIRST**
Adds the `isAdmin` field to all existing `allowedUsers` documents.

**Problem:** Recent security updates require an `isAdmin` field to distinguish admin users from regular users. Existing users don't have this field.

**Solution:** Adds `isAdmin: true` for configured admin emails, `isAdmin: false` for all others.

**Status:** **REQUIRED** - Must run before deploying recent security updates

**Quick Start:**
```bash
# 1. Create config file from example
cp admin-emails.config.example.js admin-emails.config.js

# 2. Edit admin-emails.config.js and add your admin email(s)
# (This file is in .gitignore and won't be committed to git)

# 3. Run dry-run to preview
node add-isAdmin-field.js

# 4. Apply changes
DRY_RUN=false node add-isAdmin-field.js
```

---

### `migrate-trip-fields.js`
Migrates trips from legacy field format to standardized format.

**Problem:** Early versions stored stops in a single field (`startStop`/`endStop`) that could contain either a stop code (numeric) or stop name (text). This made querying and validation difficult.

**Solution:** Split into separate `startStopCode`/`startStopName` and `endStopCode`/`endStopName` fields.

**Status:** Optional - Run to clean up technical debt

## Running Migrations

### Prerequisites

1. **Install dependencies:**
   ```bash
   cd migrations
   npm install firebase-admin
   ```

2. **Download service account key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save as `serviceAccountKey.json` in project root
   - **Important:** Never commit this file to git!

### Dry Run (Recommended First Step)

Always run in dry-run mode first to see what would change:

```bash
node migrate-trip-fields.js
```

This will:
- ✅ Show what would be migrated
- ✅ Not make any changes
- ✅ Skip backup creation

### Live Migration

Once you've reviewed the dry run output:

```bash
DRY_RUN=false node migrate-trip-fields.js
```

This will:
- ✅ Create a backup collection (e.g., `trips_backup_2026-01-24T12-00-00-000Z`)
- ✅ Migrate trips in batches
- ✅ Preserve all other trip fields
- ✅ Can be safely re-run (idempotent)

### Skip Backup (Not Recommended)

If you really want to skip the backup:

```bash
DRY_RUN=false SKIP_BACKUP=true node migrate-trip-fields.js
```

## Safety Features

All migrations include:

- **Dry-run mode by default:** Preview changes before applying
- **Automatic backups:** Creates timestamped backup collection
- **Batch processing:** Handles large datasets (500 docs per batch)
- **Idempotent:** Safe to run multiple times
- **Progress logging:** Shows real-time progress
- **Error handling:** Rolls back batch on failure

## Migration Checklist

Before running a migration:

- [ ] Read the migration script to understand what it does
- [ ] Run in dry-run mode and review output
- [ ] Ensure you have a recent Firestore backup (Firebase Console > Firestore > Backups)
- [ ] Test on a development project first (if available)
- [ ] Run during low-traffic period
- [ ] Monitor Cloud Functions logs during migration

After running a migration:

- [ ] Verify data looks correct in Firestore Console
- [ ] Test app functionality (create trip, view trips, etc.)
- [ ] Check error logs in Firebase Console
- [ ] Keep backup collection for at least 7 days
- [ ] Document migration in CHANGELOG

## Troubleshooting

### "Error: Could not load the default credentials"

You need to download the service account key. See Prerequisites above.

### "PERMISSION_DENIED: Missing or insufficient permissions"

The service account key doesn't have access to the project. Make sure you downloaded it from the correct Firebase project.

### Migration is slow

This is normal! Migrations process in small batches to avoid rate limits and timeout issues. A dataset of 10,000 trips might take 5-10 minutes.

### How to rollback a migration?

If something goes wrong:

1. **Stop the migration** (Ctrl+C)
2. **Find the backup collection** in Firestore (e.g., `trips_backup_2026-01-24T...`)
3. **Run this script to restore:**

```javascript
// restore-from-backup.js
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function restore() {
  const backupName = 'trips_backup_2026-01-24T12-00-00-000Z'; // Replace with your backup
  const snapshot = await db.collection(backupName).get();

  let count = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.set(db.collection('trips').doc(doc.id), doc.data());
    count++;

    if (count % 500 === 0) {
      await batch.commit();
    }
  }

  await batch.commit();
  console.log(`Restored ${count} trips`);
  process.exit(0);
}

restore();
```

## Best Practices

1. **Always test migrations on development data first**
2. **Run during low-traffic periods** (late night/early morning)
3. **Monitor logs** during and after migration
4. **Keep backups** for at least 7 days after migration
5. **Document changes** in your team wiki/changelog
6. **Verify results** by spot-checking random documents

## Future Migrations

When creating new migrations:

1. Copy the template from `migrate-trip-fields.js`
2. Implement your migration logic
3. Add dry-run and backup features
4. Test thoroughly on development data
5. Document in this README
6. Add to version control

## Support

If you encounter issues:

1. Check Firebase Console logs
2. Review the migration script output
3. Verify service account permissions
4. Check Firestore indexes are created
5. Open an issue on GitHub
