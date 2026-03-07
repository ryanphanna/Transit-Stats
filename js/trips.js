
import { db, Timestamp } from './firebase.js';
import { UI } from './ui-utils.js';
import { Stats } from './stats.js';
import { Templates } from './templates.js';
import { PredictionEngine } from './predict.js';

/**
 * TransitStats Trips Module
 * Handles loading, rendering, and managing trips
 */
export const Trips = {
    allCompletedTrips: [],
    displayedTripsCount: 0,
    TRIPS_PER_BATCH: 15,
    tripsObserver: null,

    init: function () {
        this.load();
        this.loadLast();
        this.setupEventListeners();
    },

    setupEventListeners: function () {
        const stopInput = document.getElementById('stopInput');
        const routeInput = document.getElementById('routeInput');
        const startBtn = document.getElementById('startBtn');
        const endBtn = document.getElementById('endBtn');
        const endModal = document.getElementById('endModal');
        const cancelBtn = document.getElementById('cancelBtn');
        const saveBtn = document.getElementById('saveBtn');

        if (stopInput && routeInput && startBtn) {
            const updateStartButton = () => {
                startBtn.disabled = !stopInput.value.trim() || !routeInput.value.trim();
            };
            stopInput.addEventListener('input', updateStartButton);
            routeInput.addEventListener('input', updateStartButton);
            startBtn.addEventListener('click', () => this.start());
        }

        if (endBtn && endModal) {
            endBtn.addEventListener('click', () => {
                endModal.style.display = 'block';
                const exitInput = document.getElementById('exitInput');
                if (exitInput) exitInput.focus();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                const endModal = document.getElementById('endModal');
                if (endModal) endModal.style.display = 'none';
                const exitInput = document.getElementById('exitInput');
                if (exitInput) exitInput.value = '';
                const saveCheck = document.getElementById('saveAsTemplate');
                if (saveCheck) saveCheck.checked = false;
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.end());
        }

        const cancelTripBtn = document.getElementById('cancelTrip');
        if (cancelTripBtn) {
            cancelTripBtn.addEventListener('click', () => this.cancelActive());
        }
    },


    tripsListener: null,

    load: function () {
        const recentTripsList = document.getElementById('recentTripsList');
        if (!recentTripsList) return;

        if (this.tripsListener) this.tripsListener();

        if (!window.currentUser) return;

        this.tripsListener = db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot((snapshot) => {
                this.allCompletedTrips = snapshot.docs
                    .filter(doc => {
                        const data = doc.data();
                        return data.endStop != null || data.discarded === true;
                    })
                    .map(doc => ({ id: doc.id, ...doc.data() }));

                this.displayedTripsCount = 0;
                recentTripsList.innerHTML = '';


                if (this.allCompletedTrips.length > 0) {
                    this.displayMore();
                    this.setupInfiniteScroll();
                    // Update stats in real-time
                    if (window.Stats) Stats.updateProfileStats();
                } else {
                    recentTripsList.innerHTML = `
                        <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                            <div style="font-size: 1.1em; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary);">No trips recorded yet</div>
                            <p style="font-size: 0.9em; max-width: 240px; margin: 0 auto; line-height: 1.4;">Your transit journey starts here. Add your first trip to see your dashboard come to life.</p>
                        </div>
                    `;
                }
            }, (error) => {
                console.error('Error in trips listener:', error);
                UI.showNotification('Connection lost. Retrying...', 'error');
            });
    },

    downloadCSV: function () {
        if (this.allCompletedTrips.length === 0) {
            UI.showNotification('No trips to export', 'error');
            return;
        }

        const headers = ['Route', 'Start Stop', 'End Stop', 'Start Time', 'End Time', 'Duration (min)', 'Agency'];
        const rows = this.allCompletedTrips.map(t => [
            t.route,
            t.startStopName || t.startStop,
            t.endStopName || t.endStop,
            t.startTime?.toDate ? t.startTime.toDate().toISOString() : '',
            t.endTime?.toDate ? t.endTime.toDate().toISOString() : '',
            t.duration || 0,
            t.agency || ''
        ]);

        let csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `transit_stats_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        UI.showNotification('CSV Exported!', 'success');
    },

    loadLast: function () {
        const repeatLastTripBtn = document.getElementById('repeatLastTripBtn');
        const repeatLastTripSection = document.getElementById('repeatLastTripSection');
        if (!repeatLastTripBtn || !repeatLastTripSection) return;

        if (!window.currentUser) return;

        db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .where('endStop', '!=', null)
            .orderBy('endTime', 'desc')
            .limit(1)
            .get()
            .then((snapshot) => {
                if (!snapshot.empty) {
                    const lastTrip = snapshot.docs[0].data();
                    repeatLastTripSection.style.display = 'block';
                    repeatLastTripBtn.onclick = () => {
                        const stopInput = document.getElementById('stopInput');
                        const routeInput = document.getElementById('routeInput');
                        if (stopInput) stopInput.value = lastTrip.startStop || '';
                        if (routeInput) routeInput.value = lastTrip.route || '';
                        this.openLogTripModal();
                        const startBtn = document.getElementById('startBtn');
                        if (startBtn) startBtn.focus();
                    };
                } else {
                    repeatLastTripSection.style.display = 'none';
                }
            });
    },

    start: function () {
        const stopInput = document.getElementById('stopInput');
        const routeInput = document.getElementById('routeInput');
        if (!stopInput || !routeInput) return;

        const stop = stopInput.value.trim();
        const route = routeInput.value.trim();

        if (!stop || !route) return;

        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Starting...';
        }

        this.getCurrentLocation((location) => {
            const parsedStartStop = this.parseStopInput(stop);
            const matchedStartStop = this.lookupStopInLibrary(parsedStartStop.stopCode, parsedStartStop.stopName);

            const tripData = {
                userId: window.currentUser.uid,
                route: route,
                startStop: stop,
                startStopCode: matchedStartStop ? matchedStartStop.code : parsedStartStop.stopCode,
                startStopName: matchedStartStop ? matchedStartStop.name : parsedStartStop.stopName,
                verifiedStartId: matchedStartStop ? matchedStartStop.id : null,
                startTime: Timestamp.now(),
                boardLocation: matchedStartStop && matchedStartStop.lat ? { lat: matchedStartStop.lat, lng: matchedStartStop.lng } : location,
                agency: matchedStartStop ? matchedStartStop.agency : (window.currentUserProfile?.defaultAgency || 'TTC'),
                source: 'web',
                verified: !!matchedStartStop
            };

            db.collection('trips').add(tripData)
                .then(() => {
                    this.closeLogTripModal();
                    if (startBtn) {
                        startBtn.disabled = false;
                        startBtn.textContent = 'Start Trip';
                    }
                    if (typeof window.checkActiveTrip === 'function') window.checkActiveTrip();
                })
                .catch(err => {
                    console.error('Error starting trip:', err);
                    UI.showNotification('Error starting trip', 'error');
                    if (startBtn) {
                        startBtn.disabled = false;
                        startBtn.textContent = 'Start Trip';
                    }
                });
        });
    },

    end: function () {
        const exitInput = document.getElementById('exitInput');
        if (!exitInput) return;
        const exitStop = exitInput.value.trim();

        if (!exitStop) {
            UI.showNotification('Please enter exit stop', 'error');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        this.getCurrentLocation((location) => {
            if (!window.activeTrip) return;

            const startTime = window.activeTrip.startTime.toDate();
            const endTime = new Date();
            const duration = Math.floor((endTime - startTime) / 1000 / 60);

            const parsedEndStop = this.parseStopInput(exitStop);
            const matchedEndStop = this.lookupStopInLibrary(parsedEndStop.stopCode, parsedEndStop.stopName);

            const updateData = {
                endStop: exitStop,
                endStopCode: matchedEndStop ? matchedEndStop.code : parsedEndStop.stopCode,
                endStopName: matchedEndStop ? matchedEndStop.name : parsedEndStop.stopName,
                verifiedEndId: matchedEndStop ? matchedEndStop.id : null,
                endTime: Timestamp.now(),
                exitLocation: matchedEndStop && matchedEndStop.lat ? { lat: matchedEndStop.lat, lng: matchedEndStop.lng } : location,
                duration: duration
            };

            db.collection('trips').doc(window.activeTrip.id).update(updateData)
                .then(() => {
                    const saveCheck = document.getElementById('saveAsTemplate');
                    const shouldSaveTemplate = saveCheck ? saveCheck.checked : false;

                    if (shouldSaveTemplate && window.Templates) {
                        Templates.save(window.activeTrip.route, window.activeTrip.startStop);
                    }

                    exitInput.value = '';
                    if (saveCheck) saveCheck.checked = false;
                    const endModal = document.getElementById('endModal');
                    if (endModal) endModal.style.display = 'none';

                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                    }

                    Templates.load();
                    Stats.updateProfileStats();
                    this.logAccuracy(window.activeTrip, updateData);
                    this.load();
                    this.loadLast();

                    UI.showNotification('Trip saved successfully!', 'success');
                })
                .catch(err => {
                    console.error('Error ending trip:', err);
                    UI.showNotification('Error ending trip', 'error');
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                    }
                });
        });
    },

    cancelActive: function () {
        if (!window.activeTrip) return;
        if (confirm('Are you sure you want to cancel this trip?')) {
            db.collection('trips').doc(window.activeTrip.id).delete()
                .then(() => {
                    window.activeTrip = null;
                    UI.showNotification('Trip canceled', 'success');
                })
                .catch(err => {
                    console.error('Error canceling trip:', err);
                    UI.showNotification('Error canceling trip', 'error');
                });
        }
    },

    displayMore: function () {
        const recentTripsList = document.getElementById('recentTripsList');
        if (!recentTripsList) return;

        const nextBatch = this.allCompletedTrips.slice(this.displayedTripsCount, this.displayedTripsCount + this.TRIPS_PER_BATCH);

        nextBatch.forEach(trip => {
            recentTripsList.appendChild(this.renderItem(trip));
        });

        this.displayedTripsCount += nextBatch.length;
        this.updateScrollSentinel();
    },

    renderItem: function (trip) {
        const endTime = trip.endTime?.toDate ? trip.endTime.toDate() : new Date();
        const dateStr = endTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const duration = trip.duration || 0;

        const rawStartStop = trip.startStopName || trip.startStop || trip.startStopCode;
        const rawEndStop = trip.endStopName || trip.endStop || trip.endStopCode;
        const startStop = this.resolveVerifiedStopName(rawStartStop) || rawStartStop || 'Unknown';
        const endStop = this.resolveVerifiedStopName(rawEndStop) || rawEndStop || 'Unknown';

        const tripDiv = document.createElement('div');
        tripDiv.className = 'trip-item';
        tripDiv.style.cursor = 'pointer';
        tripDiv.onclick = () => this.openEditTripModal(trip.id);

        // Build trip item using safe DOM APIs (textContent auto-escapes)
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 16px;';

        const info = document.createElement('div');
        info.style.cssText = 'flex: 1; min-width: 0;';
        const routeEl = document.createElement('div');
        routeEl.style.fontWeight = '700';
        routeEl.textContent = trip.route;
        const stopsEl = document.createElement('div');
        stopsEl.style.cssText = 'font-size: 0.9em; color: var(--text-secondary);';
        stopsEl.textContent = `${startStop} → ${endStop}`;
        info.appendChild(routeEl);
        info.appendChild(stopsEl);

        const meta = document.createElement('div');
        meta.style.cssText = 'text-align: right; font-size: 0.85em;';
        const dateEl = document.createElement('div');
        dateEl.textContent = dateStr;
        const durEl = document.createElement('div');
        durEl.style.color = 'var(--text-secondary)';
        durEl.textContent = `${duration} min`;
        meta.appendChild(dateEl);
        meta.appendChild(durEl);

        row.appendChild(info);
        row.appendChild(meta);
        tripDiv.appendChild(row);
        return tripDiv;
    },

    updateScrollSentinel: function () {
        const recentTripsList = document.getElementById('recentTripsList');
        if (!recentTripsList) return;

        let sentinel = document.getElementById('tripsSentinel');
        if (sentinel) sentinel.remove();

        if (this.displayedTripsCount < this.allCompletedTrips.length) {
            sentinel = document.createElement('div');
            sentinel.id = 'tripsSentinel';
            sentinel.style.cssText = 'padding: 15px; text-align: center; color: var(--text-muted);';
            sentinel.innerHTML = 'Loading more trips...';
            recentTripsList.appendChild(sentinel);
        }
    },

    setupInfiniteScroll: function () {
        const sentinel = document.getElementById('tripsSentinel');
        if (!sentinel) return;

        this.tripsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && this.displayedTripsCount < this.allCompletedTrips.length) {
                this.displayMore();
            }
        }, { rootMargin: '100px' });

        this.tripsObserver.observe(sentinel);
    },

    openLogTripModal: function () {
        const modal = document.getElementById('logTripModal');
        if (modal) modal.style.display = 'block';
        const routeInput = document.getElementById('routeInput');
        if (routeInput) routeInput.focus();
    },

    closeLogTripModal: function () {
        const modal = document.getElementById('logTripModal');
        if (modal) modal.style.display = 'none';
    },

    openEditTripModal: function (tripId) {
        db.collection('trips').doc(tripId).get()
            .then(doc => {
                const trip = doc.data();
                document.getElementById('editTripId').value = tripId;
                document.getElementById('editRouteInput').value = trip.route || '';
                document.getElementById('editStartStopInput').value = trip.startStopName || trip.startStop || '';
                document.getElementById('editEndStopInput').value = trip.endStopName || trip.endStop || '';
                document.getElementById('editTripModal').style.display = 'block';
            })
            .catch(err => {
                console.error('Error fetching trip for edit:', err);
                UI.showNotification('Error loading trip details', 'error');
            });
    },

    closeEditTripModal: function () {
        const modal = document.getElementById('editTripModal');
        if (modal) modal.style.display = 'none';
    },

    saveEdited: function () {
        const id = document.getElementById('editTripId').value;
        const data = {
            route: document.getElementById('editRouteInput').value.trim(),
            startStopName: document.getElementById('editStartStopInput').value.trim(),
            endStopName: document.getElementById('editEndStopInput').value.trim(),
            updatedAt: Timestamp.now()
        };
        db.collection('trips').doc(id).update(data)
            .then(() => {
                this.closeEditTripModal();
                this.load();
                UI.showNotification('Trip updated', 'success');
            })
            .catch(err => {
                console.error('Error saving edited trip:', err);
                UI.showNotification('Error updating trip', 'error');
            });
    },

    getCurrentLocation: function (callback) {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (p) => callback({ lat: p.coords.latitude, lng: p.coords.longitude }),
                () => callback(null),
                { timeout: 10000, maximumAge: 60000 }
            );
        } else callback(null);
    },

    parseStopInput: function (input) {
        if (!input) return { stopCode: null, stopName: null };
        const trimmed = input.trim();
        if (/^\d+$/.test(trimmed)) return { stopCode: trimmed, stopName: null };
        const match = trimmed.match(/^(.+?)\s+(\d{4,6})$/) || trimmed.match(/^(\d{4,6})\s+(.+)$/);
        if (match) {
            const isAtEnd = /^\d+$/.test(match[2]);
            return { stopCode: isAtEnd ? match[2] : match[1], stopName: (isAtEnd ? match[1] : match[2]).trim() };
        }
        return { stopCode: null, stopName: trimmed };
    },

    lookupStopInLibrary: function (code, name) {
        const lib = window.stopsLibrary || [];
        if (code) {
            const stop = lib.find(s => s.code === code);
            if (stop) return stop;
        }
        if (name) {
            const lower = name.toLowerCase();
            return lib.find(s => s.name?.toLowerCase() === lower || s.aliases?.some(a => a.toLowerCase() === lower));
        }
        return null;
    },

    resolveVerifiedStopName: function (val) {
        const stop = this.lookupStopInLibrary(val, val);
        return stop ? stop.name : null;
    },

    /**
     * Silent evaluation: logs predicted vs actual to predictionStats
     */
    logAccuracy: function (activeTrip, finalData) {
        if (!activeTrip || !window.PredictionEngine) return;

        try {
            // Reconstruct the actual trip for evaluation
            const actualTrip = {
                ...activeTrip,
                endStop: finalData.endStop,
                endTime: finalData.endTime
            };

            // Use history EXCLUDING the current active trip
            const history = this.allCompletedTrips.filter(t => t.id !== activeTrip.id);

            const result = PredictionEngine.evaluate(history, actualTrip);

            db.collection('predictionStats').add({
                userId: window.currentUser.uid,
                ...result,
                route: actualTrip.route,
                timestamp: Timestamp.now()
            });

            console.log('Silent Prediction Accuracy Logged:', result.isHit ? '✅ HIT' : '❌ MISS', result);
        } catch (err) {
            console.error('Error logging accuracy:', err);
        }
    }
};

// Global exports for legacy compatibility
window.Trips = Trips;
window.startNewTrip = Trips.start.bind(Trips);
window.loadTrips = Trips.load.bind(Trips);
window.openLogTripModal = Trips.openLogTripModal.bind(Trips);
window.closeLogTripModal = Trips.closeLogTripModal.bind(Trips);
window.openEditTripModal = Trips.openEditTripModal.bind(Trips);

window.closeEditTripModal = Trips.closeEditTripModal.bind(Trips);
window.saveEditedTrip = Trips.saveEdited.bind(Trips);
window.downloadTripsCSV = Trips.downloadCSV.bind(Trips);
