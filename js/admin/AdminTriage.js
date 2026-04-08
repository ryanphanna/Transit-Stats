import { db } from '../firebase.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';

/**
 * AdminTriage - Manages the Inbox (unlinked stop strings) and Consolidation (merging variants).
 */
export const AdminTriage = {
    inbox: [],
    consolidation: [],

    async loadInbox(stopsLibrary) {
        // Use existing Trips cache if available
        const tripsToScan = window.Trips?.allTrips || [];
        const rawStops = {};

        tripsToScan.forEach(trip => {
            const process = (val, route) => {
                if (!val) return;
                const norm = Utils.normalizeIntersectionStop(val);
                if (this._isLinked(norm, stopsLibrary)) return;

                if (!rawStops[norm]) rawStops[norm] = { count: 0, routes: new Set() };
                rawStops[norm].count++;
                if (route) rawStops[norm].routes.add(route);
            };

            process(trip.startStopName || trip.startStop || trip.startStopCode, trip.route);
            process(trip.endStopName || trip.endStop || trip.endStopCode, trip.route);
        });

        this.inbox = Object.entries(rawStops).map(([name, data]) => ({
            name,
            count: data.count,
            routes: Array.from(data.routes),
            suggestion: this._suggestStop(name, stopsLibrary)
        })).sort((a, b) => b.count - a.count);

        return this.inbox;
    },

    async loadConsolidation() {
        const trips = window.Trips?.allTrips || [];
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

            UI.showNotification(`Merged ${toUpdate.length} variants into "${item.canonical}".`, 'success');
            await this.loadConsolidation();
        } catch (err) {
            UI.showNotification('Merge failed: ' + err.message);
        }
    },

    _isLinked(name, library) {
        const norm = name.toLowerCase();
        return library.some(s => 
            s.name.toLowerCase() === norm || 
            (s.aliases && s.aliases.some(a => a.toLowerCase() === norm)) ||
            (s.code && s.code === name)
        );
    },

    _suggestStop(rawName, library) {
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = norm(rawName);
        if (!target) return null;

        let best = null;
        let bestScore = 0;

        for (const stop of library) {
            const candidates = [stop.name, ...(stop.aliases || [])];
            for (const cand of candidates) {
                const cNorm = norm(cand);
                let score = target === cNorm ? 100 : (cNorm.includes(target) || target.includes(cNorm) ? 75 : 0);
                if (score > bestScore) { bestScore = score; best = stop; }
            }
            if (bestScore === 100) break;
        }
        return bestScore >= 70 ? { stop: best, score: bestScore } : null;
    }
};
