import { db } from '../firebase.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';
import { ModalManager } from '../shared/modal-engine.js';

/**
 * AdminLibrary - Handles Stop and Route library management (CRUD and rendering).
 */
export const AdminLibrary = {
    stops: [],
    routes: [],

    async loadStops() {
        const snap = await db.collection('stops').orderBy('name').get();
        this.stops = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return this.stops;
    },

    async loadRoutes(agency) {
        const snap = await db.collection('routes').where('agency', '==', agency).get();
        this.routes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this.routes.sort((a, b) => {
            const aNum = parseInt(a.routeShortName, 10);
            const bNum = parseInt(b.routeShortName, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            return String(a.routeShortName).localeCompare(String(b.routeShortName));
        });
        return this.routes;
    },

    async saveStop(data) {
        try {
            if (data.id) {
                const id = data.id;
                delete data.id;
                await db.collection('stops').doc(id).update({ ...data, updatedAt: new Date() });
            } else {
                await db.collection('stops').add({ ...data, aliases: [], createdAt: new Date(), updatedAt: new Date() });
            }
            UI.showNotification('Stop saved successfully.', 'success');
        } catch (err) {
            UI.showNotification('Save failed: ' + err.message);
            throw err;
        }
    },

    async deleteStop(id) {
        try {
            await db.collection('stops').doc(id).delete();
            UI.showNotification('Stop deleted.', 'success');
        } catch (err) {
            UI.showNotification('Delete failed: ' + err.message);
            throw err;
        }
    },

    async deleteRoute(id) {
        try {
            await db.collection('routes').doc(id).delete();
            UI.showNotification('Route removed.', 'success');
        } catch (err) {
            UI.showNotification('Removal failed: ' + err.message);
            throw err;
        }
    },

    async linkAlias(stopId, alias) {
        const stop = this.stops.find(s => s.id === stopId);
        if (!stop) return;
        const aliases = stop.aliases || [];
        if (!aliases.includes(alias)) {
            aliases.push(alias);
            await db.collection('stops').doc(stopId).update({ aliases, updatedAt: new Date() });
            UI.showNotification(`Linked alias "${alias}" to ${stop.name}.`, 'success');
        }
    }
};
