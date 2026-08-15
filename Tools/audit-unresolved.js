/**
 * Audit current Firestore trips against the normalized stop library.
 *
 * This is intentionally user-scoped: Transit Stats is a personal tracker,
 * and the Admin inbox only shows the signed-in user's trips.
 *
 * Usage:
 *   node Tools/audit-unresolved.js --user-id <firebase-uid>
 *   node Tools/audit-unresolved.js --user-id <firebase-uid> --json
 *   node Tools/audit-unresolved.js --user-id <firebase-uid> --output /tmp/stops.json
 *   node Tools/audit-unresolved.js --all-users
 *
 * The script is read-only. It never changes trips or the stop library.
 */

const fs = require('node:fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const USER_ID = process.argv.includes('--user-id')
    ? process.argv[process.argv.indexOf('--user-id') + 1]
    : null;
const ALL_USERS = process.argv.includes('--all-users');
const JSON_OUTPUT = process.argv.includes('--json');
const OUTPUT_INDEX = process.argv.indexOf('--output');
const OUTPUT_PATH = OUTPUT_INDEX >= 0 ? process.argv[OUTPUT_INDEX + 1] : null;

if ((!USER_ID && !ALL_USERS) || (USER_ID && ALL_USERS)) {
    console.error('Choose exactly one scope: --user-id <firebase-uid> or --all-users.');
    process.exit(1);
}

initializeApp({ credential: cert(require(KEY_PATH)) });
const db = getFirestore();

function addOccurrence(groups, trip, side, rawName, rawCode, isLinked) {
    if (!rawName && !rawCode) return { total: 0, recognized: 0, unresolved: 0 };
    if (isLinked) return { total: 1, recognized: 1, unresolved: 0 };

    const agency = trip.agency || '';
    const name = String(rawName || rawCode).trim();
    const key = [agency.toLowerCase(), name.toLowerCase(), rawCode || ''].join('|');
    const existing = groups.get(key) || {
        agency: agency || '?',
        rawName: name,
        rawCode: rawCode || null,
        occurrences: 0,
        roles: new Set(),
        routes: new Set(),
        tripIds: [],
    };
    existing.occurrences += 1;
    existing.roles.add(side);
    if (trip.route) existing.routes.add(String(trip.route));
    if (existing.tripIds.length < 20 && trip.id) existing.tripIds.push(trip.id);
    groups.set(key, existing);
    return { total: 1, recognized: 0, unresolved: 1 };
}

async function run() {
    const [{ docs: stopDocs }, { docs: tripDocs }] = await Promise.all([
        db.collection('stops').get(),
        db.collection('trips').get(),
    ]);
    const { isStopLinked } = await import('../js/stop-library-match.js');
    const stops = stopDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    const trips = tripDocs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(trip => ALL_USERS || trip.userId === USER_ID);
    const groups = new Map();
    const totals = { total: 0, recognized: 0, unresolved: 0 };

    for (const trip of trips) {
        for (const [side, name, code] of [
            ['boarding', trip.startStopName || trip.startStop, trip.startStopCode],
            ['exiting', trip.endStopName || trip.endStop, trip.endStopCode],
        ]) {
            const linked = stops.some(stop => isStopLinked({
                agency: trip.agency,
                stopName: name,
                stopCode: code,
            }, stop));
            const result = addOccurrence(groups, trip, side, name, code, linked);
            totals.total += result.total;
            totals.recognized += result.recognized;
            totals.unresolved += result.unresolved;
        }
    }

    const unresolved = [...groups.values()]
        .map(group => ({
            ...group,
            roles: [...group.roles].sort(),
            routes: [...group.routes].sort(),
        }))
        .sort((a, b) => b.occurrences - a.occurrences || a.rawName.localeCompare(b.rawName));
    const report = {
        scope: ALL_USERS ? 'all-users' : 'user',
        ...(USER_ID ? { userId: USER_ID } : {}),
        tripsScanned: trips.length,
        stopsInLibrary: stops.length,
        totalOccurrences: totals.total,
        recognizedOccurrences: totals.recognized,
        unresolvedOccurrences: totals.unresolved,
        unresolvedLabels: unresolved.length,
        unresolved,
    };

    if (OUTPUT_PATH) fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    if (JSON_OUTPUT) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(`Trips scanned: ${report.tripsScanned}`);
    console.log(`Stops in library: ${report.stopsInLibrary}`);
    console.log(`Stop occurrences: ${report.totalOccurrences}`);
    console.log(`Recognized occurrences: ${report.recognizedOccurrences}`);
    console.log(`Unresolved occurrences: ${report.unresolvedOccurrences}`);
    console.log(`Unresolved labels: ${report.unresolvedLabels}`);
    if (OUTPUT_PATH) console.log(`Report written: ${OUTPUT_PATH}`);
    for (const group of unresolved) {
        console.log(`\n[${group.occurrences}×] ${group.agency} · ${group.rawName}${group.rawCode ? ` · code ${group.rawCode}` : ''}`);
        console.log(`  ${group.roles.join(', ')} · routes ${group.routes.join(', ') || '?'}`);
    }
}

run().catch(error => {
    console.error('Audit failed:', error);
    process.exit(1);
});
