import { arrayUnion, db } from '../firebase.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';
import { TripController } from '../trips/TripController.js';
import { isStopLinked, stopBelongsToAgency } from '../stop-library-match.js';

/**
 * AdminTriage - Inbox of individual trips with unrecognized stops.
 */
export const AdminTriage = {
    inbox: [],
    consolidation: [],
    gtfsMetaCache: new Map(),

    async loadInbox(stopsLibrary) {
        const trips = TripController.allTrips || [];
        const items = [];

        trips.forEach(trip => {
            const checkStop = (rawName, rawCode, role) => {
                if (!rawName && !rawCode) return;
                const norm = Utils.normalizeIntersectionStop(rawName || rawCode);
                if (this._isLinked(norm, rawCode, trip.agency, stopsLibrary)) return;

                items.push({
                    tripId: trip.id,
                    role,           // 'start' or 'end'
                    rawName: norm,
                    rawCode: rawCode || null,
                    route: trip.route,
                    direction: trip.direction || null,
                    agency: trip.agency || null,
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
     * - Updates only the trip's canonical stop linkage fields
     * - Adds the raw string as an alias on the stop
     * - Adds the trip's route + direction to the stop
     */
    async linkTrip(item, stopId, stopsLibrary) {
        const stop = stopsLibrary.find(s => s.id === stopId);
        if (!stop) return;

        const tripRef = db.collection('trips').doc(item.tripId);
        const tripSnap = await tripRef.get();
        if (!tripSnap.exists) throw new Error('Trip no longer exists');
        const trip = tripSnap.data();

        // 2. Add raw string as alias (if not already there)
        const aliases = stop.aliases || [];
        const alreadyAliased = aliases.some(a => a.toLowerCase() === item.rawName.toLowerCase());

        // 3. Add route to stop's routes (if not already there)
        const routes = stop.routes || [];
        const alreadyHasRoute = !item.route || routes.includes(item.route);

        const updates = {};
        if (!alreadyAliased && item.rawName !== stop.name) {
            updates.aliases = arrayUnion(item.rawName);
        }
        if (!alreadyHasRoute) {
            updates.routes = arrayUnion(item.route);
        }
        if (item.direction && !stop.direction) {
            updates.direction = item.direction;
        }

        const tripUpdates = {
            [item.role === 'start' ? 'startStopCode' : 'endStopCode']: stop.code || null,
            stop_matched: this._tripHasLinkedStops(trip, item, stop, stopsLibrary),
            updatedAt: new Date(),
        };
        const batch = db.batch();
        if (Object.keys(updates).length > 0) batch.update(db.collection('stops').doc(stopId), updates);
        batch.update(tripRef, tripUpdates);
        await batch.commit();
    },

    async loadGtfsStopMeta(agency) {
        if (!agency) return [];
        if (this.gtfsMetaCache.has(agency)) return this.gtfsMetaCache.get(agency);
        const response = await fetch(`https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasStopsMeta?agency=${encodeURIComponent(agency)}`);
        if (!response.ok) throw new Error('GTFS stop metadata unavailable');
        const data = await response.json();
        const stops = Array.isArray(data.stops) ? data.stops : [];
        this.gtfsMetaCache.set(agency, stops);
        return stops;
    },

    async findGtfsCandidates(item, query = item.rawName) {
        const stops = await this.loadGtfsStopMeta(item.agency);
        const normalize = value => String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
        const target = normalize(query);
        const route = normalize(item.route);
        const routeMatches = stops.filter(stop => (stop.routes || []).some(candidate => normalize(candidate) === route));
        const directionMatches = item.direction
            ? routeMatches.filter(stop => normalize(stop.direction) === normalize(item.direction))
            : routeMatches;
        const candidates = item.direction && directionMatches.length > 0 ? directionMatches : routeMatches;

        return candidates
            .map(stop => {
                const name = normalize(stop.name);
                const code = normalize(stop.code);
                const score = target && (name === target || code === target)
                    ? 100
                    : target && (name.includes(target) || target.includes(name)) ? 75 : 0;
                return { ...stop, score };
            })
            .filter(stop => stop.score > 0)
            .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
            .slice(0, 8);
    },

    async addGtfsStopAndLink(item, candidate, stopsLibrary) {
        if (!candidate?.name || !candidate?.code) throw new Error('GTFS candidate is incomplete');
        const existing = stopsLibrary.find(stop =>
            stop.agency === item.agency && String(stop.code || '') === String(candidate.code),
        );
        if (existing) {
            await this.linkTrip(item, existing.id, stopsLibrary);
            return;
        }

        const stopRef = await db.collection('stops').add({
            name: candidate.name,
            code: candidate.code,
            agency: item.agency,
            agencies: [item.agency],
            aliases: item.rawName ? [item.rawName] : [],
            routes: item.route ? [item.route] : [],
            ...(candidate.direction ? { direction: candidate.direction } : {}),
            lat: candidate.lat,
            lng: candidate.lon,
            source: 'gtfs',
            gtfsVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const added = { id: stopRef.id, ...candidate, agency: item.agency };
        stopsLibrary.push(added);
        await this.linkTrip(item, stopRef.id, stopsLibrary);
    },

    _tripHasLinkedStops(trip, item, selectedStop, library) {
        const otherRole = item.role === 'start' ? 'end' : 'start';
        const selectedLinked = Boolean(selectedStop?.code || selectedStop?.name);
        const otherName = otherRole === 'start'
            ? (trip.startStopName || trip.startStop)
            : (trip.endStopName || trip.endStop);
        const otherCode = otherRole === 'start' ? trip.startStopCode : trip.endStopCode;
        const otherLinked = !otherName && !otherCode
            ? false
            : library.some(stop => isStopLinked({
                agency: trip.agency,
                stopName: otherName,
                stopCode: otherCode,
            }, stop));
        return selectedLinked && otherLinked;
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

    _isLinked(name, code, agency, library) {
        return library.some(stop => isStopLinked({
            agency,
            stopName: name,
            stopCode: code,
        }, stop));
    },

    _suggestStop(rawName, code, agency, library) {
        if (code) {
            const byCode = library.find(s => isStopLinked({ agency, stopCode: code }, s));
            if (byCode) return { stop: byCode, score: 100 };
        }
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = norm(rawName);
        if (!target) return null;
        let best = null, bestScore = 0;
        for (const stop of library) {
            if (!stopBelongsToAgency(stop, agency)) continue;
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
