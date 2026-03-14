
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

    rebuildStopsIndex: function () {
        const lib = window.stopsLibrary || [];
        if (lib.length === 0) return;

        // Clear existing indices
        this.stopsIndex.clear();
        this.stopNormalizationCache.clear();
        
        console.log(`\ud83d\udd0d Indexing ${lib.length} stops progressively...`);
        
        let i = 0;
        const BATCH_SIZE = 400;
        
        const processBatch = () => {
            const end = Math.min(i + BATCH_SIZE, lib.length);
            for (; i < end; i++) {
                const stop = lib[i];
                if (stop.code) {
                    this.stopsIndex.set(`code:${stop.code}`, stop);
                }
                
                const processName = (n) => {
                    if (!n) return;
                    const lower = n.toLowerCase();
                    const canon = this.normalizeStopName(n).toLowerCase();
                    this.stopsIndex.set(`name:${lower}`, stop);
                    if (canon !== lower) {
                        this.stopsIndex.set(`name:${canon}`, stop);
                    }
                };

                processName(stop.name);
                if (stop.aliases && Array.isArray(stop.aliases)) {
                    stop.aliases.forEach(alias => processName(alias));
                }
            }
            
            if (i < lib.length) {
                // Use requestIdleCallback if available, otherwise setTimeout
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(processBatch);
                } else {
                    setTimeout(processBatch, 0);
                }
            } else {
                this.isIndexing = false;
                console.log(`\u2705 Indexed ${this.stopsIndex.size} stop patterns.`);
            }
        };
        
        processBatch();
    },

    lookupStopInLibrary: function (code, name) {
        if (this.stopsIndex.size === 0 && window.stopsLibrary && window.stopsLibrary.length > 0 && !this.isIndexing) {
            this.rebuildStopsIndex();
        }

        if (code) {
            const byCode = this.stopsIndex.get(`code:${code}`);
            if (byCode) return byCode;
        }

        if (name) {
            const lower = name.toLowerCase().trim();
            const byName = this.stopsIndex.get(`name:${lower}`);
            if (byName) return byName;
            
            // Also try normalized intersection form
            const canon = this.normalizeStopName(name).toLowerCase();
            const byCanon = this.stopsIndex.get(`name:${canon}`);
            if (byCanon) return byCanon;
        }

        return null;
    },

    allCompletedTrips: [],
    displayedTripsCount: 0,
    TRIPS_PER_BATCH: 15,
    tripsObserver: null,
    stopNormalizationCache: new Map(),
    stopsIndex: new Map(),
    _readyPromise: null,
    _resolveReady: null,

    init: function () {
        this._readyPromise = new Promise(resolve => { this._resolveReady = resolve; });
        this.load();
        this.setupEventListeners();
    },

    setupEventListeners: function () {
        const cancelBtn = document.getElementById('cancelBtn');
        const saveBtn = document.getElementById('saveBtn');

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
    },


    tripsListener: null,

    load: function () {
        const recentTripsList = document.getElementById('recentTripsList');
        if (!recentTripsList) return;

        if (this.tripsListener) this.tripsListener();

        if (!window.currentUser) return;

        console.log(`Trips: Setting up listener for user ${window.currentUser.uid}...`);
        this.tripsListener = db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot((snapshot) => {
                console.log(`Trips: Received snapshot with ${snapshot.size} docs.`);
                this.allCompletedTrips = snapshot.docs
                    .filter(doc => {
                        const data = doc.data();
                        return (data.endStop != null || data.endStopName != null) || data.discarded === true;
                    })
                    .map(doc => {
                        const data = doc.data();
                        // Pre-calculate normalized names to avoid expensive re-computation during interactions
                        const rawStart = data.startStopName || data.startStop || '';
                        const rawEnd = data.endStopName || data.endStop || '';
                        
                        const displayStart = this.normalizeStopName(rawStart);
                        const displayEnd = this.normalizeStopName(rawEnd);

                        return { 
                            id: doc.id, 
                            ...data,
                            _displayStart: displayStart,
                            _displayEnd: displayEnd,
                            _normStart: displayStart.toLowerCase(),
                            _normEnd: displayEnd.toLowerCase()
                        };
                    });

                if (this._resolveReady) {
                    this._resolveReady();
                    this._resolveReady = null;
                }

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
        const directionInput = document.getElementById('directionInput');
        if (!stopInput || !routeInput) return;

        const stop = stopInput.value.trim();
        const route = routeInput.value.trim();
        const direction = directionInput ? directionInput.value.trim() || null : null;

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
                direction: direction ? PredictionEngine._normalizeDirection(direction) : null,
                source: 'web',
                verified: !!matchedStartStop,
                isPublic: window.currentUserProfile?.isPublic || false
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
                    // Note: this.load() is intentionally omitted — the onSnapshot listener
                    // already picks up the update in real-time.
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

        // Always disconnect before creating a new observer to avoid accumulating observers
        if (this.tripsObserver) this.tripsObserver.disconnect();

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
        const directionInput = document.getElementById('directionInput');
        if (directionInput) directionInput.value = '';
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
                // onSnapshot listener handles UI refresh automatically
                UI.showNotification('Trip updated', 'success');
            })
            .catch(err => {
                console.error('Error saving edited trip:', err);
                UI.showNotification('Error updating trip', 'error');
            });
    },

    deleteTrip: function () {
        const id = document.getElementById('editTripId')?.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this trip? This cannot be undone.')) return;

        db.collection('trips').doc(id).delete()
            .then(() => {
                this.closeEditTripModal();
                // onSnapshot listener handles UI refresh automatically
                UI.showNotification('Trip deleted', 'success');
            })
            .catch(err => {
                console.error('Error deleting trip:', err);
                UI.showNotification('Error deleting trip', 'error');
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

    /**
     * Normalize intersection-format stops to a canonical form.
     * "Spadina & Nassau", "spadina/nassau", "King / Spadina" → "King / Spadina"
     * Non-intersection names are returned title-cased but otherwise unchanged.
     */
    normalizeStopName: function (str) {
        if (!str || typeof str !== 'string') return str;
        if (this.stopNormalizationCache.has(str)) return this.stopNormalizationCache.get(str);

        const trimmed = str.trim();
        if (!trimmed) return '';

        // Optimization: if it's already in the format "X / Y" or "X & Y" and doesn't need title casing, we can skip heavy regex
        
        const titleCase = s => {
            if (!s) return '';
            // Match words and replace them. Optimization: pre-calculate lower case for comparison.
            return s.toLowerCase().replace(/\b\w+/g, (w, offset) => {
                if (offset > 0 && ['at', 'and', 'the', 'of', 'for', 'on', '&'].includes(w)) return w;
                return w.charAt(0).toUpperCase() + w.slice(1);
            });
        };
        
        // Check for a leading stop code prefix like "13161 Spadina / King" — strip the code
        const codePrefix = trimmed.match(/^(\d{4,6})\s+(.+)$/);
        const core = codePrefix ? codePrefix[2] : trimmed;
        
        // Detect intersection: contains / & or standalone "at"
        const intersectionMatch = core.match(/^(.+?)\s*(?:\/|&|\bat\b)\s*(.+)$/i);
        let result;
        if (intersectionMatch) {
            const a = titleCase(intersectionMatch[1].trim());
            const b = titleCase(intersectionMatch[2].trim());
            const intersectionPart = `${a} / ${b}`;
            result = codePrefix ? `${codePrefix[1]} ${intersectionPart}` : intersectionPart;
        } else {
            result = codePrefix ? trimmed : titleCase(trimmed);
        }

        this.stopNormalizationCache.set(str, result);
        return result;
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
        if (this.stopsIndex.size === 0 && window.stopsLibrary && window.stopsLibrary.length > 0) {
            this.rebuildStopsIndex();
        }

        if (code) {
            const stop = this.stopsIndex.get(`code:${code}`);
            if (stop) return stop;
        }

        if (name) {
            const lower = name.toLowerCase();
            const stopByDirectName = this.stopsIndex.get(`name:${lower}`);
            if (stopByDirectName) return stopByDirectName;

            const canon = this.normalizeStopName(name).toLowerCase();
            const stopByCanonName = this.stopsIndex.get(`name:${canon}`);
            if (stopByCanonName) return stopByCanonName;
        }

        return null;
    },

    resolveVerifiedStopName: function (val) {
        const stop = this.lookupStopInLibrary(val, val);
        return stop ? stop.name : null;
    },

    /**
     * Build deduplicated stop suggestions from history + library.
     * @param {string} query - What the user has typed so far
     * @param {object} ctx - { route, direction, startStop, field: 'start'|'end' }
     *   route/direction boost stops seen on that route/direction.
     *   For field='end', startStop additionally boosts stops seen as the exit
     *   after boarding at startStop on the same route.
     * Returns [{ name, source, score, hint? }]
     */
    buildStopSuggestions: function (query, ctx = {}) {
        if (!query || query.length < 2) return [];
        const q = query.toLowerCase();

        const baseRoute = r => r ? r.toString().replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : '';
        const ctxFamily = baseRoute(ctx.route);
        const ctxDirNorm = ctx.direction ? ctx.direction.toLowerCase().replace(/bound$/i, '').trim() : null;

        // Score each history stop
        const scores = {};  // normalized name → { score, hint }

        this.allCompletedTrips.forEach(t => {
            const tripFamily = baseRoute(t.route);
            const routeMatch = ctxFamily && tripFamily === ctxFamily;
            const dirMatch = ctxDirNorm && t.direction &&
                t.direction.toLowerCase().replace(/bound$/i, '').trim() === ctxDirNorm;

            const isSequenceMatch = ctx.field === 'end' && ctx.startStop && routeMatch &&
                (t.startStopName || t.startStop || '').toLowerCase() === ctx.startStop.toLowerCase();

            const stops = ctx.field === 'end'
                ? [{ name: t.endStopName || t.endStop, norm: t._normEnd, display: t._displayEnd, role: 'end' }]
                : [
                    { name: t.startStopName || t.startStop, norm: t._normStart, display: t._displayStart, role: 'start' },
                    { name: t.endStopName || t.endStop, norm: t._normEnd, display: t._displayEnd, role: 'end' }
                ];

            stops.forEach(({ name, norm, display, role }) => {
                if (!name || typeof name !== 'string') return;
                
                // Fast-pass: Check if the pre-normalized lowercase name contains our search query
                // This avoids calling the full normalization logic for 99% of trips.
                const searchName = norm || name.toLowerCase();
                if (!searchName.includes(q)) return;

                // Use the pre-calculated display name (title-case) if available
                const normalized = display || this.normalizeStopName(name.trim());

                let weight = 1;
                if (routeMatch) weight *= 4;
                if (dirMatch) weight *= 1.5;
                if (isSequenceMatch && role === 'end') weight *= 6;

                if (!scores[normalized]) scores[normalized] = { score: 0, hint: null };
                scores[normalized].score += weight;

                // Hint label for what boosted this result
                if (isSequenceMatch && role === 'end' && !scores[normalized].hint) {
                    scores[normalized].hint = 'frequent exit';
                } else if (routeMatch && !scores[normalized].hint) {
                    scores[normalized].hint = ctx.route;
                }
            });
        });

        const historySuggestions = Object.entries(scores)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 5)
            .map(([name, { score, hint }]) => ({ name, source: 'history', score, hint }));

        // Library suggestions (unaffected by context — they're always relevant if they match)
        const libSuggestions = (window.stopsLibrary || [])
            .filter(s => {
                const candidates = [s.name, ...(s.aliases || [])];
                return candidates.some(c => c.toLowerCase().includes(q));
            })
            .slice(0, 3)
            .map(s => ({ name: s.name, source: 'library', score: 2, hint: null }));

        // Merge, deduplicate by normalized name, sort by score
        const seen = new Set();
        return [...historySuggestions, ...libSuggestions]
            .filter(s => {
                const key = this.normalizeStopName(s.name).toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
    },

    /**
     * Attach autocomplete dropdown to a stop text input.
     * @param {HTMLInputElement} inputEl
     * @param {function} getContext - called on each keystroke, returns { route, direction, startStop, field }
     */
    setupStopAutocomplete: function (inputEl, getContext = () => ({})) {
        if (!inputEl) return;
        let dropdown = null;

        const hideDropdown = () => {
            if (dropdown) { dropdown.remove(); dropdown = null; }
        };

        const showDropdown = (suggestions) => {
            hideDropdown();
            if (suggestions.length === 0) return;

            dropdown = document.createElement('div');
            dropdown.style.cssText = [
                'position:absolute', 'top:100%', 'left:0', 'right:0', 'z-index:9999',
                'background:var(--bg-secondary)', 'border:1px solid var(--border-light)',
                'border-radius:8px', 'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
                'overflow:hidden', 'margin-top:4px'
            ].join(';');

            suggestions.forEach(s => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-light);font-size:0.95em;display:flex;justify-content:space-between;align-items:center;';
                const nameEl = document.createElement('span');
                nameEl.textContent = s.name;
                item.appendChild(nameEl);
                if (s.hint) {
                    const badge = document.createElement('span');
                    badge.textContent = s.hint;
                    badge.style.cssText = 'font-size:0.72em;padding:1px 6px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary);';
                    item.appendChild(badge);
                } else if (s.source === 'library') {
                    const badge = document.createElement('span');
                    badge.textContent = '★';
                    badge.style.cssText = 'font-size:0.75em;color:var(--accent-electric);';
                    item.appendChild(badge);
                }
                item.addEventListener('mouseover', () => item.style.background = 'var(--bg-tertiary)');
                item.addEventListener('mouseout', () => item.style.background = '');
                item.addEventListener('mousedown', e => {
                    e.preventDefault();
                    inputEl.value = s.name;
                    hideDropdown();
                    inputEl.dispatchEvent(new Event('input'));
                });
                dropdown.appendChild(item);
            });

            const wrapper = inputEl.parentElement;
            if (wrapper) {
                wrapper.style.position = 'relative';
                wrapper.appendChild(dropdown);
            }
        };

        let autocompleteTimer = null;
        inputEl.addEventListener('input', () => {
            clearTimeout(autocompleteTimer);
            autocompleteTimer = setTimeout(() => {
                const suggestions = this.buildStopSuggestions(inputEl.value.trim(), getContext());
                showDropdown(suggestions);
            }, 120);
        });

        inputEl.addEventListener('blur', () => {
            setTimeout(hideDropdown, 150);
        });

        inputEl.addEventListener('keydown', e => {
            if (!dropdown) return;
            const items = dropdown.querySelectorAll('div');
            const active = dropdown.querySelector('[data-active]');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = active ? active.nextElementSibling : items[0];
                if (active) delete active.dataset.active;
                if (next) { next.dataset.active = '1'; next.style.background = 'var(--bg-tertiary)'; }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = active ? active.previousElementSibling : items[items.length - 1];
                if (active) delete active.dataset.active;
                if (prev) { prev.dataset.active = '1'; prev.style.background = 'var(--bg-tertiary)'; }
            } else if (e.key === 'Enter' && active) {
                e.preventDefault();
                const nameEl = active.querySelector('span');
                if (nameEl) {
                    inputEl.value = nameEl.textContent;
                    hideDropdown();
                    inputEl.dispatchEvent(new Event('input'));
                }
            } else if (e.key === 'Escape') {
                hideDropdown();
            }
        });
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
window.deleteTrip = Trips.deleteTrip.bind(Trips);
