/**
 * Migration Script: Add isAdmin Field to allowedUsers
 *
 * This script adds the isAdmin field to all existing allowedUsers documents.
 *
 * BEFORE:
 * allowedUsers/{email} = { email: "user@example.com" }
 *
 * AFTER:
 * allowedUsers/{email} = { email: "user@example.com", isAdmin: false }
 *
 * USAGE:
 * 1. Install dependencies: npm install firebase-admin
 * 2. Download service account key from Firebase Console
 * 3. Configure ADMIN_EMAILS below with your admin email(s)
 * 4. Run: node add-isAdmin-field.js
 *
 * SAFETY:
 * - Dry-run mode by default (set DRY_RUN=false to apply)
 * - Shows what will change before applying
 * - Idempotent: safe to run multiple times
 * - Only updates documents missing isAdmin field
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Load admin emails from config file
 * Config file is NOT committed to git for privacy
 */
let ADMIN_EMAILS = [];

const configPath = path.join(__dirname, 'admin-emails.config.js');
const exampleConfigPath = path.join(__dirname, 'admin-emails.config.example.js');

if (fs.existsSync(configPath)) {
  try {
    ADMIN_EMAILS = require('./admin-emails.config.js');
  } catch (error) {
    console.error('❌ Error loading admin-emails.config.js:', error.message);
    console.error('Make sure the file exports an array of email addresses.');
    process.exit(1);
  }
} else {
  console.error('❌ Configuration file not found!');
  console.error('');
  console.error('Please create admin-emails.config.js by copying the example:');
  console.error(`  cp ${exampleConfigPath} ${configPath}`);
  console.error('');
  console.error('Then edit admin-emails.config.js and add your admin email(s).');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN !== 'false';

// ============================================================================

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting isAdmin field migration...\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes will be made)' : '✍️  LIVE (changes will be applied)'}\n`);

  if (ADMIN_EMAILS.length === 0) {
    console.warn('⚠️  WARNING: No admin emails configured in ADMIN_EMAILS array!');
    console.warn('All users will be set to isAdmin: false\n');
  } else {
    console.log('📋 Configured admin emails:');
    ADMIN_EMAILS.forEach(email => console.log(`   - ${email}`));
    console.log('');
  }

  // Get all allowedUsers
  const snapshot = await db.collection('allowedUsers').get();

  if (snapshot.empty) {
    console.log('⚠️  No users found in allowedUsers collection');
    console.log('Nothing to migrate.');
    process.exit(0);
  }

  console.log(`Found ${snapshot.docs.length} user(s) in allowedUsers collection\n`);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = data.email || doc.id;
    totalProcessed++;

    // Skip if already has isAdmin field
    if (data.hasOwnProperty('isAdmin')) {
      console.log(`✓ Skipping ${email} (already has isAdmin: ${data.isAdmin})`);
      totalSkipped++;
      continue;
    }

    // Determine if this user should be an admin
    const isAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

    if (DRY_RUN) {
      console.log(`Would update ${email}:`);
      console.log(`  Current: ${JSON.stringify(data)}`);
      console.log(`  New:     { ...current, isAdmin: ${isAdmin} }\n`);
    } else {
      console.log(`📝 Updating ${email} → isAdmin: ${isAdmin}`);
      batch.update(doc.ref, { isAdmin });
    }

    totalUpdated++;
  }

  // Commit the batch
  if (!DRY_RUN && totalUpdated > 0) {
    await batch.commit();
    console.log('\n✅ Batch committed successfully!');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total users processed: ${totalProcessed}`);
  console.log(`Users updated: ${totalUpdated}`);
  console.log(`Users skipped (already had isAdmin): ${totalSkipped}`);

  // Show breakdown
  if (totalUpdated > 0) {
    const adminCount = ADMIN_EMAILS.length;
    const regularCount = totalUpdated - adminCount;

    console.log('\nBreakdown:');
    console.log(`  Admins (isAdmin: true): ${adminCount}`);
    console.log(`  Regular users (isAdmin: false): ${regularCount}`);
  }

  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('To apply changes, run: DRY_RUN=false node add-isAdmin-field.js');
  } else {
    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify changes in Firebase Console (Firestore > allowedUsers)');
    console.log('2. Test admin access by signing into /admin.html');
    console.log('3. Test regular user access (should be blocked from /admin.html)');
    console.log('4. Deploy updated code: firebase deploy');
  }

  process.exit(0);
}

// Validation
if (!ADMIN_EMAILS.every(email => typeof email === 'string' && email.includes('@'))) {
  console.error('❌ Error: ADMIN_EMAILS must be an array of valid email addresses');
  console.error('Example:');
  console.error('  const ADMIN_EMAILS = [');
  console.error("    'your@email.com',");
  console.error("    'admin@example.com'");
  console.error('  ];');
  process.exit(1);
}

// Run migration
runMigration().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
