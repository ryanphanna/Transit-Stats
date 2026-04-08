import { db } from '../firebase.js';
import { UI } from '../ui-utils.js';

/**
 * GTFSEngine - Handles parsing routes.txt and batch-importing into Firestore.
 */
export const GTFSEngine = {
    parsedRoutes: [],
    importArmed: false,
    importTimer: null,

    /**
     * Parse routes.txt content.
     */
    parseRoutes(csvText) {
        const lines = csvText.replace(/\r\n/g, '\n').split('\n');
        if (lines.length < 2) return [];

        const header = this._parseCsvLine(lines[0]);
        const idx = {
            routeId: header.indexOf('route_id'),
            shortName: header.indexOf('route_short_name'),
            longName: header.indexOf('route_long_name'),
            routeType: header.indexOf('route_type')
        };

        if (idx.shortName === -1 && idx.routeId === -1) {
            throw new Error('Invalid routes.txt: missing route_id or route_short_name');
        }

        const routes = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const fields = this._parseCsvLine(line);
            const shortName = idx.shortName !== -1 ? (fields[idx.shortName] || '').trim() : '';
            const longName = idx.longName !== -1 ? (fields[idx.longName] || '').trim() : '';
            const routeId = idx.routeId !== -1 ? (fields[idx.routeId] || '').trim() : '';
            const routeType = parseInt(fields[idx.routeType] || '3', 10);

            const name = shortName || routeId;
            if (name) {
                routes.push({ routeShortName: name, routeLongName: longName, routeType, gtfsRouteId: routeId });
            }
        }
        this.parsedRoutes = routes;
        return routes;
    },

    _parseCsvLine(line) {
        const fields = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQuotes = false; }
                else { cur += ch; }
            } else {
                if (ch === '"') { inQuotes = true; }
                else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
                else { cur += ch; }
            }
        }
        fields.push(cur.trim());
        return fields;
    },

    async runImport(agency, onComplete) {
        if (!this.parsedRoutes.length) return;

        try {
            // 1. Clear existing routes for this agency
            const existing = await db.collection('routes').where('agency', '==', agency).get();
            const BATCH_SIZE = 450; 
            
            for (let i = 0; i < existing.docs.length; i += BATCH_SIZE) {
                const batch = db.batch();
                existing.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            // 2. Upload new routes
            for (let i = 0; i < this.parsedRoutes.length; i += BATCH_SIZE) {
                const batch = db.batch();
                this.parsedRoutes.slice(i, i + BATCH_SIZE).forEach(route => {
                    const safeId = `${agency}_${route.routeShortName}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
                    const ref = db.collection('routes').doc(safeId);
                    batch.set(ref, { ...route, agency });
                });
                await batch.commit();
            }

            UI.showNotification(`Successfully imported ${this.parsedRoutes.length} routes for ${agency}.`, 'success');
            if (onComplete) onComplete();
        } catch (err) {
            UI.showNotification('Import failed: ' + err.message);
            throw err;
        }
    }
};
