import { db, auth, Timestamp } from '../../js/firebase.js';
import { requireAuth } from '../../js/shared/auth-guard.js';
import { initHeader } from '../../js/shared/header.js';
import { UI } from '../../js/ui-utils.js';

/**
 * Rocket — High-precision transit data collection instrument.
 */

const State = {
    active: false,
    sessionId: null,
    route: '',
    direction: '',
    startStop: '',
    doors: 'CLOSED',
    signal: 'RED',
    motion: 'IDLE',
    events: [],
    startTime: null
};

const DOM = {
    setupView: document.getElementById('setup-view'),
    instrumentView: document.getElementById('instrument-view'),
    endStopGroup: document.getElementById('end-stop-group'),
    endStopInput: document.getElementById('end-stop-input'),
    btnDoors: document.getElementById('btn-doors'),
    valDoors: document.getElementById('val-doors'),
    btnSignal: document.getElementById('btn-signal'),
    valSignal: document.getElementById('val-signal'),
    btnMotion: document.getElementById('btn-motion'),
    valMotion: document.getElementById('val-motion'),
    mainAction: document.getElementById('main-action'),
    routeInput: document.getElementById('route-input'),
    dirInput: document.getElementById('dir-input'),
    stopInput: document.getElementById('stop-input')
};

// --- GPS: request permission early, cache position ---
let _lastPosition = null;
let _gpsGranted = false;

function requestGPSPermission() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => { _lastPosition = pos; _gpsGranted = true; },
        () => { _gpsGranted = false; },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
}

function getPosition() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => { _lastPosition = pos; resolve(pos); },
            () => resolve(_lastPosition), // fall back to last known, or null
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
        );
    });
}

// --- Session Recovery ---
async function recoverActiveSession(user) {
    try {
        const snap = await db.collection('rocket_trips')
            .where('userId', '==', user.uid)
            .where('status', '==', 'active')
            .orderBy('startTime', 'desc')
            .limit(1)
            .get();

        if (snap.empty) return false;

        const doc = snap.docs[0];
        const data = doc.data();

        State.active = true;
        State.sessionId = doc.id;
        State.route = data.route;
        State.direction = data.direction;
        State.startStop = data.start_stop;
        State.startTime = data.startTime?.toMillis?.() ?? Date.now();
        State.events = data.events || [];

        // Restore last known instrument state from events
        for (const e of [...State.events].reverse()) {
            if (e.type === 'DOOR_CHANGE' && !State.doors) { State.doors = e.value; }
            if (e.type === 'SIGNAL_CHANGE' && !State.signal) { State.signal = e.value; }
            if (e.type === 'MOTION_CHANGE' && !State.motion) { State.motion = e.value; }
        }

        _enterRecordingMode();
        UI.showNotification('Session recovered — still recording.');
        return true;
    } catch (e) {
        console.warn('Session recovery failed:', e);
        return false;
    }
}

function _enterRecordingMode() {
    DOM.setupView.style.display = 'none';
    DOM.instrumentView.style.display = 'grid';
    DOM.mainAction.innerHTML = '<i data-lucide="check-circle" class="icon-inline"></i> <span>FINALIZE RESEARCH</span>';
    DOM.mainAction.className = 'main-btn btn-finalize';

    // Sync instrument UI to recovered state
    DOM.valDoors.textContent = State.doors;
    DOM.btnDoors.className = `control-btn btn-doors ${State.doors.toLowerCase()}`;
    DOM.valSignal.textContent = State.signal;
    DOM.btnSignal.className = `control-btn btn-signal ${State.signal.toLowerCase()}`;
    DOM.valMotion.textContent = State.motion;
    DOM.btnMotion.className = `control-btn btn-motion motion-full ${State.motion.toLowerCase()}`;
    
    if (window.lucide) lucide.createIcons();
}

// --- Event Logging ---
async function logEvent(type, data = {}) {
    const pos = await getPosition();
    const event = {
        type,
        timestamp: Date.now(),
        location: pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy } : null,
        ...data
    };
    State.events.push(event);

    if (State.active && auth.currentUser) {
        await db.collection('rocket_trips').doc(State.sessionId).set({
            userId: auth.currentUser.uid,
            route: State.route,
            direction: State.direction,
            start_stop: State.startStop,
            startTime: Timestamp.fromMillis(State.startTime),
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
            events: State.events,
            status: 'active'
        }, { merge: true });
    }
}

// --- Session Lifecycle ---
async function startSession() {
    const route = DOM.routeInput.value.trim();
    const direction = DOM.dirInput.value.trim();
    const startStop = DOM.stopInput.value.trim();

    if (!route || !direction || !startStop) {
        UI.showNotification('Please fill in Route, Direction, and Entry Stop.');
        return;
    }

    State.active = true;
    State.route = route;
    State.direction = direction;
    State.startStop = startStop;
    State.startTime = Date.now();
    State.sessionId = `rocket_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    State.events = [];
    State.doors = 'CLOSED';
    State.signal = 'RED';
    State.motion = 'IDLE';

    await logEvent('SESSION_START', { route, direction, startStop });
    _enterRecordingMode();
}

async function showFinalizeForm() {
    DOM.endStopGroup.style.display = '';
    DOM.endStopInput.focus();
    DOM.mainAction.innerHTML = '<i data-lucide="check-circle" class="icon-inline"></i> <span>CONFIRM & FINALIZE</span>';
    DOM.mainAction.onclick = finalizeSession;
    if (window.lucide) lucide.createIcons();
}

async function finalizeSession() {
    const endStop = DOM.endStopInput.value.trim();
    if (!endStop) {
        UI.showNotification('Enter the exit stop before finalizing.');
        DOM.endStopInput.focus();
        return;
    }

    DOM.mainAction.disabled = true;
    DOM.mainAction.innerHTML = '<i data-lucide="loader" class="icon-inline spin"></i> <span>FINALIZING...</span>';

    try {
        const stats = calculateStats(State.events);
        await logEvent('SESSION_END', { endStop, ...stats });

        const finalTripId = `trip_${Date.now()}`;
        await db.collection('trips').doc(finalTripId).set({
            userId: auth.currentUser.uid,
            route: State.route,
            direction: State.direction,
            startStop: State.startStop,
            endStop,
            startTime: Timestamp.fromMillis(State.startTime),
            endTime: Timestamp.now(),
            duration: Math.round((Date.now() - State.startTime) / 60000),
            rocketTripId: State.sessionId,
            agency: 'TTC',
            source: 'rocket',
            stats
        });

        await db.collection('rocket_trips').doc(State.sessionId).update({
            status: 'completed',
            finalizeTime: Timestamp.now()
        });

        UI.showNotification('Session finalized. Data transmitted.');
        setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
        UI.showNotification('Finalize failed: ' + err.message);
        DOM.mainAction.disabled = false;
        DOM.mainAction.innerHTML = '<i data-lucide="check-circle" class="icon-inline"></i> <span>CONFIRM & FINALIZE</span>';
        if (window.lucide) lucide.createIcons();
    }
}

function calculateStats(events) {
    let dwellTotal = 0;
    let signalTotal = 0;
    for (let i = 0; i < events.length - 1; i++) {
        const duration = events[i + 1].timestamp - events[i].timestamp;
        if (events[i].type === 'DOOR_CHANGE' && events[i].value === 'OPEN') dwellTotal += duration;
        if (events[i].type === 'SIGNAL_CHANGE' && events[i].value === 'RED') signalTotal += duration;
    }
    return { dwell_ms: dwellTotal, signal_ms: signalTotal, event_count: events.length };
}

function updateInstrument(type) {
    if (!State.active) return;
    if (type === 'doors') {
        State.doors = State.doors === 'CLOSED' ? 'OPEN' : 'CLOSED';
        DOM.valDoors.textContent = State.doors;
        DOM.btnDoors.className = `control-btn btn-doors ${State.doors.toLowerCase()}`;
        logEvent('DOOR_CHANGE', { value: State.doors });
    } else if (type === 'signal') {
        State.signal = State.signal === 'RED' ? 'GREEN' : 'RED';
        DOM.valSignal.textContent = State.signal;
        DOM.btnSignal.className = `control-btn btn-signal ${State.signal.toLowerCase()}`;
        logEvent('SIGNAL_CHANGE', { value: State.signal });
    } else if (type === 'motion') {
        State.motion = State.motion === 'IDLE' ? 'MOVING' : 'IDLE';
        DOM.valMotion.textContent = State.motion;
        DOM.btnMotion.className = `control-btn btn-motion motion-full ${State.motion.toLowerCase()}`;
        logEvent('MOTION_CHANGE', { value: State.motion });
    }
}

function setupEventListeners() {
    DOM.mainAction.addEventListener('click', async () => {
        if (!State.active) {
            await startSession();
        } else if (DOM.endStopGroup.style.display === 'none' || !DOM.endStopGroup.style.display) {
            await showFinalizeForm();
        }
    });
    DOM.btnDoors.addEventListener('click', () => updateInstrument('doors'));
    DOM.btnSignal.addEventListener('click', () => updateInstrument('signal'));
    DOM.btnMotion.addEventListener('click', () => updateInstrument('motion'));
}

async function init() {
    const { user, isAdmin } = await requireAuth({ adminOnly: true });
    initHeader({ isAdmin, currentPage: 'rocket' });

    // Request GPS permission upfront so it's granted before recording starts
    requestGPSPermission();

    setupEventListeners();

    // Recover any in-progress session
    await recoverActiveSession(user);

    if (window.lucide) lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
