import { db } from '../firebase.js';
import firebase from '../firebase.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';
import { TripController } from '../trips/TripController.js';

/**
 * AdminTriage - Inbox of individual trips with unrecognized stops.
 */
export const AdminTriage = {
    inbox: [],
    consolidation: [],

    async loadInbox(stopsLibrary) {
        const trips = TripController.allTrips || [];
        const items = [];

        trips.forEach(trip => {
            const checkStop = (rawName, rawCode, role) => {
                if (!rawName && !rawCode) return;
                const norm = Utils.normalizeIntersectionStop(rawName || rawCode);
                if (this._isLinked(norm, rawCode, stopsLibrary)) return;

                items.push({
                    tripId: trip.id,
                    role,           // 'start' or 'end'
                    rawName: norm,
                    rawCode: rawCode || null,
                    route: trip.route,
                    direction: trip.direction || null,
                    date: trip.startTime,
                });
            };

            checkStop(trip.startStopName || trip.startStop, trip.startStopCode, 'start');
            checkStop(trip.endStopName || trip.endStop, trip.endStopCode, 'end');
        });

        // Sort: most recent first
        items.sort((a, b) => {
            const ta = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
            const tb = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
            return tb - ta;
        });

        this.inbox = items;
        return items;
    },

    /**
     * Link a single trip's stop to a canonical stop in the library.
     * - Updates the trip's stop fields to the canonical name + code
     * - Adds the raw string as an alias on the stop
     * - Adds the trip's route + direction to the stop
     */
    async linkTrip(item, stopId, stopsLibrary) {
        const stop = stopsLibrary.find(s => s.id === stopId);
        if (!stop) return;

        const tripField = item.role === 'start'
            ? { startStopName: stop.name, startStopCode: stop.code || '' }
            : { endStopName: stop.name, endStopCode: stop.code || '' };

        // 1. Update the trip
        await db.collection('trips').doc(item.tripId).update(tripField);

        // 2. Add raw string as alias (if not already there)
        const aliases = stop.aliases || [];
        const alreadyAliased = aliases.some(a => a.toLowerCase() === item.rawName.toLowerCase());

        // 3. Add route to stop's routes (if not already there)
        const routes = stop.routes || [];
        const alreadyHasRoute = !item.route || routes.includes(item.route);

        const updates = {};
        if (!alreadyAliased && item.rawName !== stop.name) {
            updates.aliases = firebase.firestore.FieldValue.arrayUnion(item.rawName);
        }
        if (!alreadyHasRoute) {
            updates.routes = firebase.firestore.FieldValue.arrayUnion(item.route);
        }
        if (item.direction && !stop.direction) {
            updates.direction = item.direction;
        }

        if (Object.keys(updates).length > 0) {
            await db.collection('stops').doc(stopId).update(updates);
        }
    },

    async loadConsolidation() {
        const trips = TripController.allTrips || [];
        const groups = {};

        for (const trip of trips) {
            const route = String(trip.route || '').trim();
            const dir = String(trip.direction || '').trim();
            const key = `${route}||${dir}`;
            if (!groups[key]) groups[key] = { route, direction: dir, starts: {}, ends: {} };

            for (const [field, bucket] of [['startStopName', 'starts'], ['endStopName', 'ends']]) {
                const raw = trip[field];
                const canon = Utils.canonicalizeForMatch(raw);
                if (!canon) continue;
                if (!groups[key][bucket][canon]) groups[key][bucket][canon] = {};
                groups[key][bucket][canon][raw] = (groups[key][bucket][canon][raw] || 0) + 1;
            }
        }

        const results = [];
        for (const group of Object.values(groups)) {
            for (const [field, bucket] of [['startStopName', 'starts'], ['endStopName', 'ends']]) {
                for (const variantCounts of Object.values(group[bucket])) {
                    const variants = Object.entries(variantCounts).sort((a, b) => b[1] - a[1]);
                    if (variants.length < 2) continue;
                    const canonical = Utils.normalizeIntersectionStop(variants[0][0]);
                    const others = variants.slice(1).map(([name]) => name);
                    results.push({
                        route: group.route,
                        direction: group.direction,
                        field,
                        canonical,
                        others,
                        allVariants: variants.map(([name, count]) => ({ name, count })),
                    });
                }
            }
        }
        this.consolidation = results;
        return results;
    },

    async mergeGroup(index) {
        const item = this.consolidation[index];
        if (!item) return;
        const variantSet = new Set(item.others);
        try {
            const snap = await db.collection('trips')
                .where('userId', '==', window.currentUser.uid)
                .where('route', '==', item.route)
                .get();
            const toUpdate = snap.docs.filter(doc => {
                const data = doc.data();
                return (String(data.direction || '').trim() === item.direction) && variantSet.has(data[item.field]);
            });
            if (toUpdate.length === 0) return;
            const batch = db.batch();
            toUpdate.forEach(doc => batch.update(doc.ref, { [item.field]: item.canonical }));
            await batch.commit();
            UI.showNotification(`Merged ${toUpdate.length} variants into "${item.canonical}".`);
        } catch (err) {
            UI.showNotification('Merge failed: ' + err.message);
        }
    },

    _isLinked(name, code, library) {
        return library.some(s =>
            (code && s.code === code) ||
            s.name.toLowerCase() === name.toLowerCase() ||
            (s.aliases && s.aliases.some(a => a.toLowerCase() === name.toLowerCase()))
        );
    },

    _suggestStop(rawName, code, library) {
        if (code) {
            const byCode = library.find(s => s.code === code);
            if (byCode) return { stop: byCode, score: 100 };
        }
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = norm(rawName);
        if (!target) return null;
        let best = null, bestScore = 0;
        for (const stop of library) {
            for (const cand of [stop.name, ...(stop.aliases || [])]) {
                const cNorm = norm(cand);
                const score = target === cNorm ? 100 : (cNorm.includes(target) || target.includes(cNorm) ? 75 : 0);
                if (score > bestScore) { bestScore = score; best = stop; }
            }
            if (bestScore === 100) break;
        }
        return bestScore >= 70 ? { stop: best, score: bestScore } : null;
    }
};
