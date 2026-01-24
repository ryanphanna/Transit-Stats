/**
 * Migration Script: Normalize Legacy Trip Fields
 *
 * This script migrates trips from legacy field format to the new standardized format:
 *
 * BEFORE (legacy):
 * - startStop: "Union Station" or "6036"
 * - endStop: "King Station" or "7542"
 *
 * AFTER (new):
 * - startStopName: "Union Station" (if text) or null
 * - startStopCode: "6036" (if numeric) or null
 * - endStopName: "King Station" (if text) or null
 * - endStopCode: "7542" (if numeric) or null
 * - Remove legacy startStop/endStop fields
 *
 * USAGE:
 * 1. Install dependencies: npm install firebase-admin
 * 2. Download service account key from Firebase Console
 * 3. Run: node migrate-trip-fields.js
 *
 * SAFETY:
 * - Runs in batches of 500 (Firestore limit)
 * - Dry-run mode by default (set DRY_RUN=false to apply)
 * - Creates backup before migrating (set SKIP_BACKUP=true to skip)
 * - Idempotent: safe to run multiple times
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Configuration
const DRY_RUN = process.env.DRY_RUN !== 'false';
const SKIP_BACKUP = process.env.SKIP_BACKUP === 'true';
const BATCH_SIZE = 500;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Determine if a stop value is numeric (stop code) or text (stop name)
 */
function categorizeStopValue(value) {
  if (!value || typeof value !== 'string') {
    return { code: null, name: null };
  }

  const trimmed = value.trim();

  // If it's all digits, it's a stop code
  if (/^\d+$/.test(trimmed)) {
    return { code: trimmed, name: null };
  }

  // Otherwise, it's a stop name
  return { code: null, name: trimmed };
}

/**
 * Check if a trip needs migration
 */
function needsMigration(trip) {
  // Has legacy fields that need conversion
  const hasLegacyStart = trip.startStop && (!trip.startStopName && !trip.startStopCode);
  const hasLegacyEnd = trip.endStop && (!trip.endStopName && !trip.endStopCode);

  return hasLegacyStart || hasLegacyEnd;
}

/**
 * Migrate a single trip document
 */
function migrateTrip(trip) {
  const updates = {};
  let changed = false;

  // Migrate start stop
  if (trip.startStop && !trip.startStopName && !trip.startStopCode) {
    const { code, name } = categorizeStopValue(trip.startStop);
    if (code) updates.startStopCode = code;
    if (name) updates.startStopName = name;
    changed = true;
  }

  // Migrate end stop
  if (trip.endStop && !trip.endStopName && !trip.endStopCode) {
    const { code, name } = categorizeStopValue(trip.endStop);
    if (code) updates.endStopCode = code;
    if (name) updates.endStopName = name;
    changed = true;
  }

  // Mark legacy fields for deletion (Firestore FieldValue.delete())
  if (changed) {
    updates.startStop = admin.firestore.FieldValue.delete();
    updates.endStop = admin.firestore.FieldValue.delete();
  }

  return changed ? updates : null;
}

/**
 * Create backup of trips collection
 */
async function createBackup() {
  if (SKIP_BACKUP) {
    console.log('⚠️  Skipping backup (SKIP_BACKUP=true)');
    return;
  }

  console.log('📦 Creating backup...');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupCollection = `trips_backup_${timestamp}`;

  const snapshot = await db.collection('trips').get();
  const batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    const backupRef = db.collection(backupCollection).doc(doc.id);
    batch.set(backupRef, doc.data());
    count++;

    if (count % BATCH_SIZE === 0) {
      await batch.commit();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
  }

  console.log(`✅ Backed up ${count} trips to ${backupCollection}`);
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting trip field migration...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '✍️  LIVE (changes will be applied)'}`);
  console.log(`Backup: ${SKIP_BACKUP ? 'Disabled' : 'Enabled'}\n`);

  // Create backup if not in dry-run mode
  if (!DRY_RUN && !SKIP_BACKUP) {
    await createBackup();
  }

  // Process in batches
  let totalProcessed = 0;
  let totalMigrated = 0;
  let lastDoc = null;
  let hasMore = true;

  while (hasMore) {
    // Query next batch
    let query = db.collection('trips')
      .orderBy('startTime', 'desc')
      .limit(BATCH_SIZE);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    // Process batch
    const batch = db.batch();
    let batchUpdates = 0;

    for (const doc of snapshot.docs) {
      const trip = doc.data();
      totalProcessed++;

      if (needsMigration(trip)) {
        const updates = migrateTrip(trip);

        if (updates) {
          totalMigrated++;
          batchUpdates++;

          if (!DRY_RUN) {
            batch.update(doc.ref, updates);
          } else {
            // Dry run: log what would change
            console.log(`\nWould migrate trip ${doc.id}:`);
            console.log(`  Old: startStop="${trip.startStop || 'null'}", endStop="${trip.endStop || 'null'}"`);
            console.log(`  New:`, updates);
          }
        }
      }

      lastDoc = doc;
    }

    // Commit batch
    if (!DRY_RUN && batchUpdates > 0) {
      await batch.commit();
      console.log(`✅ Migrated batch of ${batchUpdates} trips`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total trips processed: ${totalProcessed}`);
  console.log(`Trips migrated: ${totalMigrated}`);
  console.log(`Trips up-to-date: ${totalProcessed - totalMigrated}`);

  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('To apply changes, run: DRY_RUN=false node migrate-trip-fields.js');
  } else {
    console.log('\n✅ Migration completed successfully!');
  }

  process.exit(0);
}

// Run migration
runMigration().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
