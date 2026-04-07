import { db, auth } from '../../js/firebase.js';

/**
 * Rocket Research Instrument - State Logic
 * High-precision transit data collection without SMS overhead.
 */

const State = {
    active: false,
    tripId: null,
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
    statusBadge: document.getElementById('status-badge'),
    btnDoors: document.getElementById('btn-doors'),
    valDoors: document.getElementById('val-doors'),
    btnSignal: document.getElementById('btn-signal'),
    valSignal: document.getElementById('val-signal'),
    btnMotion: document.getElementById('btn-motion'),
    valMotion: document.getElementById('val-motion'),
    mainAction: document.getElementById('main-action'),
    routeInput: document.getElementById('route-input'),
    dirInput: document.getElementById('dir-input'),
    stopInput: document.getElementById('stop-input'),
    userName: document.getElementById('user-name')
};

async function init() {
    console.log("Rocket booting...");
    
    // Auth Guard: Rocket requires a valid profile to record research data
    auth.onAuthStateChanged(user => {
        if (!user) {
            console.error("Rocket Access Denied: No authenticated session found.");
            alert("Authentication Required: Please log in to Transit Stats to use Rocket Research tools.");
            window.location.href = '../../index.html';
            return;
        }
        
        console.log("Rocket Authenticated:", user.email);
        if (DOM.userName) {
            DOM.userName.textContent = user.displayName || user.email.split('@')[0];
        }
        setupEventListeners();
    });
}

function setupEventListeners() {
    DOM.mainAction.addEventListener('click', toggleSession);
    DOM.btnDoors.addEventListener('click', () => updateState('doors'));
    DOM.btnSignal.addEventListener('click', () => updateState('signal'));
    DOM.btnMotion.addEventListener('click', () => updateState('motion'));
}

async function toggleSession() {
    if (!State.active) {
        await startSession();
    } else {
        await finalizeSession();
    }
}

async function startSession() {
    const route = DOM.routeInput.value.trim();
    const direction = DOM.dirInput.value.trim();
    const startStop = DOM.stopInput.value.trim();

    if (!route || !direction || !startStop) {
        alert("Please provide Route, Direction, and Start Stop to begin research.");
        return;
    }

    State.active = true;
    State.route = route;
    State.direction = direction;
    State.startStop = startStop;
    State.startTime = Date.now();
    State.sessionId = `rocket_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    State.events = [];

    // Log the initiation event
    await logEvent('SESSION_START', { route, direction, startStop });

    // UI transition
    DOM.setupView.style.display = 'none';
    DOM.instrumentView.style.display = 'grid';
    DOM.mainAction.textContent = 'FINALIZE RESEARCH';
    DOM.mainAction.classList.add('btn-danger');
    DOM.mainAction.style.background = 'var(--danger)'; 
    DOM.mainAction.style.color = 'white';
    DOM.statusBadge.textContent = 'RECORDING';
    DOM.statusBadge.style.background = 'var(--accent-glass)';
    DOM.statusBadge.style.color = 'var(--accent)';
}

async function updateState(type) {
    if (!State.active) return;

    if (type === 'doors') {
        State.doors = State.doors === 'CLOSED' ? 'OPEN' : 'CLOSED';
        DOM.valDoors.textContent = State.doors;
        DOM.btnDoors.className = `control-btn btn-doors ${State.doors.toLowerCase()}`;
        await logEvent('DOOR_CHANGE', { value: State.doors });
    } else if (type === 'signal') {
        State.signal = State.signal === 'RED' ? 'GREEN' : 'RED';
        DOM.valSignal.textContent = State.signal;
        DOM.btnSignal.className = `control-btn btn-signal ${State.signal.toLowerCase()}`;
        await logEvent('SIGNAL_CHANGE', { value: State.signal });
    } else if (type === 'motion') {
        State.motion = State.motion === 'IDLE' ? 'MOVING' : 'IDLE';
        DOM.valMotion.textContent = State.motion;
        DOM.btnMotion.className = `control-btn btn-motion ${State.motion.toLowerCase()}`;
        await logEvent('MOTION_CHANGE', { value: State.motion });
    }

    // Visual feedback is enough
}

async function logEvent(type, data = {}) {
    console.log(`[Event] ${type}`, data);

    const event = {
        type,
        timestamp: Date.now(),
        location: null,
        ...data
    };

    // Geographic anchoring
    try {
        const pos = await getCurrentPosition();
        event.location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
        };
    } catch (e) {
        console.warn("Location anchor failed", e);
    }

    State.events.push(event);

    // Dynamic stream to Firestore
    if (State.active) {
        const user = auth.currentUser;
        if (!user) return;

        await db.collection('rocket_trips').doc(State.sessionId).set({
            userId: user.uid,
            route: State.route,
            direction: State.direction,
            start_stop: State.startStop,
            startTime: firebase.firestore.Timestamp.fromMillis(State.startTime),
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
            events: State.events,
            status: 'active'
        }, { merge: true });
    }
}

async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    });
}

async function finalizeSession() {
    const user = auth.currentUser;
    if (!user) {
        alert("Session lost. Authentication required.");
        window.location.reload();
        return;
    }

    const endStop = prompt("End Stop Name or Code:");
    if (endStop === null) return; // Cancelled

    DOM.statusBadge.textContent = 'FINALIZING...';
    
    // 1. Calculate Statistics
    const stats = calculateStats(State.events);
    
    // 2. Final Event
    await logEvent('SESSION_END', { endStop, ...stats });

    // 3. Write to main TRIPS collection (The "Summary Badge")
    const finalTripId = `trip_${Date.now()}`;
    
    await db.collection('trips').doc(finalTripId).set({
        userId: user.uid,
        route: State.route,
        direction: State.direction,
        startStop: State.startStop,
        endStop: endStop,
        startTime: firebase.firestore.Timestamp.fromMillis(State.startTime),
        endTime: firebase.firestore.Timestamp.now(),
        duration: Math.round((Date.now() - State.startTime) / 60000),
        rocketTripId: State.sessionId, // Link to the high-res stream
        agency: 'TTC',
        source: 'rocket',
        stats: stats
    });

    // 4. Update the rocket_trips stream status
    await db.collection('rocket_trips').doc(State.sessionId).update({
        status: 'completed',
        finalizeTime: firebase.firestore.Timestamp.now()
    });

    alert("Research Session Finalized. Data transmitted.");
    window.location.reload();
}

function calculateStats(events) {
    let dwellTotal = 0;
    let signalTotal = 0;
    
    // Simple durational analysis
    for (let i = 0; i < events.length - 1; i++) {
        const duration = events[i+1].timestamp - events[i].timestamp;
        if (events[i].type === 'DOOR_CHANGE' && events[i].value === 'OPEN') {
            dwellTotal += duration;
        }
        if (events[i].type === 'SIGNAL_CHANGE' && events[i].value === 'RED') {
            signalTotal += duration;
        }
    }
    
    return {
        dwell_ms: dwellTotal,
        signal_ms: signalTotal,
        event_count: events.length
    };
}

init();
