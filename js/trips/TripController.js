import firebase, { db } from '../firebase.js';

/**
 * TripController - Manages the trip data stream and atomic updates.
 */
export const TripController = {
    allTrips: [],
    activeTrip: null,
    unsubscribe: null,

    listen(userId, onUpdate) {
        if (!userId) return;
        if (this.unsubscribe) this.unsubscribe();

        const sixHoursMs = 6 * 60 * 60 * 1000;

        this.unsubscribe = db.collection('trips')
            .where('userId', '==', userId)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const now = Date.now();
                const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Filter Active vs Completed (Active is < 6h old and has no end time)
                this.activeTrip = docs.find(t => {
                    if (t.endTime || t.discarded) return false;
                    const startTime = t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime).getTime();
                    return (now - startTime) < sixHoursMs;
                });

                // Completed trips or those that timed out
                this.allTrips = docs.filter(t => 
                    t.endTime || 
                    t.discarded || 
                    (now - (t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime).getTime())) >= sixHoursMs
                );

                if (onUpdate) onUpdate(this.allTrips, this.activeTrip);
            }, err => {
                console.error("TripController Error:", err);
            });
    },

    async update(id, data) {
        return db.collection('trips').doc(id).update({
            ...data,
            updatedAt: new Date()
        });
    },

    async delete(id) {
        return db.collection('trips').doc(id).delete();
    },

    async confirmTrip(id) {
        return db.collection('trips').doc(id).update({
            needs_review: firebase.firestore.FieldValue.delete()
        });
    },

    async breakJourneyLink(tripAId, tripBId) {
        const del = firebase.firestore.FieldValue.delete();
        const batch = db.batch();
        batch.update(db.collection('trips').doc(tripAId), { journeyId: del });
        batch.update(db.collection('trips').doc(tripBId), { journeyId: del });
        return batch.commit();
    }
};
