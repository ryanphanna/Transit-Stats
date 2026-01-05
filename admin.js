console.log('🚀 TransitStats Admin Loading...');

const firebaseConfig = {
    apiKey: "AIzaSyBgY37b_aUorxdEW6DnocFoo8ekbTTFpao",
    authDomain: "transitstats-21ba4.firebaseapp.com",
    projectId: "transitstats-21ba4",
    storageBucket: "transitstats-21ba4.firebasestorage.app",
    messagingSenderId: "756203797723",
    appId: "1:756203797723:web:2e5aab94a6de20cf06a0fe"
};

// Initialize Firebase if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Global State
let stopsLibrary = [];
let pendingStops = [];
let currentTargetString = '';
let currentUser = null;

// Auth Listener
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        // Simple admin check (in a real app, use custom claims or a whitelist collection)
        // For this demo, we assume any authenticated user accessing this hidden page is admin
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('userInfo').style.display = 'flex';

        loadData();
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminContent').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
    }
});

function login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        alert('Login failed: ' + error.message);
    });
}

function loadData() {
    loadStopLibrary();
    loadProvisionalStops();
}

async function loadStopLibrary() {
    try {
        const snapshot = await db.collection('stops').orderBy('name').get();
        stopsLibrary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderStopLibrary(stopsLibrary);
        updateStopSelect();
    } catch (error) {
        console.error('Error loading lib:', error);
    }
}

async function loadProvisionalStops() {
    try {
        // Find trips that are NOT verified and have a startStop string
        // Note: This is a heavy query for client-side aggregation. 
        // In production, use Cloud Functions or an aggregation collection.
        const snapshot = await db.collection('trips')
            .where('verified', '==', false)
            .where('userId', '==', currentUser.uid) // Limit to current user's trips for now
            .limit(100)
            .get();

        const uniquePending = new Set();
        snapshot.docs.forEach(doc => {
            const trip = doc.data();
            const rawStop = trip.startStop || trip.startStopName || trip.startStopCode;
            if (rawStop && typeof rawStop === 'string') {
                uniquePending.add(rawStop.trim());
            }
        });

        // Filter out strings that are already known aliases
        // (This catches cases where trips aren't marked verified yet but the alias exists)
        pendingStops = Array.from(uniquePending).filter(str => !findStopByAlias(str));

        renderPendingList();
    } catch (error) {
        console.error('Error loading pending:', error);
    }
}

function findStopByAlias(str) {
    return stopsLibrary.find(stop =>
        (stop.name === str) ||
        (stop.code === str) ||
        (stop.aliases && stop.aliases.includes(str))
    );
}

// Rendering
function renderStopLibrary(stops) {
    const container = document.getElementById('stopLibrary');
    if (stops.length === 0) {
        container.innerHTML = '<div class="empty-state">No confirmed stops in library.</div>';
        return;
    }

    container.innerHTML = stops.map(stop => `
        <div class="stop-card">
            <h4>${stop.name} <span class="agency-badge">(${stop.agency || 'Unknown'})</span></h4>
            <div class="meta">
                ${stop.code ? `<span class="badge">#${stop.code}</span>` : ''} 
                📍 ${stop.lat?.toFixed(4)}, ${stop.lng?.toFixed(4)}
            </div>
            ${renderAliases(stop.aliases)}
            <div style="margin-top: 10px; text-align: right;">
                <button class="btn btn-outline btn-sm" onclick="editStop('${stop.id}')">Edit</button>
            </div>
        </div>
    `).join('');
}

function renderAliases(aliases) {
    if (!aliases || aliases.length === 0) return '';
    return `
        <div class="aliases">
            Aliases: 
            ${aliases.map(a => `<span class="alias-badge">${a}</span>`).join('')}
        </div>
    `;
}

function renderPendingList() {
    const container = document.getElementById('pendingList');
    if (pendingStops.length === 0) {
        container.innerHTML = '<div class="empty-state">No unlinked stops found! 🎉</div>';
        return;
    }

    container.innerHTML = pendingStops.map(str => `
        <div class="pending-item">
            <strong>${str}</strong>
            <button class="btn btn-primary btn-sm" onclick="openLinkModal('${str.replace(/'/g, "\\'")}')">Link</button>
        </div>
    `).join('');
}

function filterStops() {
    const query = document.getElementById('stopSearch').value.toLowerCase();
    const filtered = stopsLibrary.filter(stop =>
        stop.name.toLowerCase().includes(query) ||
        (stop.code && stop.code.toLowerCase().includes(query)) ||
        (stop.aliases && stop.aliases.some(a => a.toLowerCase().includes(query)))
    );
    renderStopLibrary(filtered);
}

function updateStopSelect() {
    const select = document.getElementById('existingStopSelect');
    select.innerHTML = '<option value="">Select a stop...</option>' +
        stopsLibrary.map(s => `<option value="${s.id}">${s.name} (${s.agency})</option>`).join('');
}


// Modal Logic
function openLinkModal(targetString) {
    currentTargetString = targetString;
    document.getElementById('modalTargetString').textContent = targetString;
    document.getElementById('linkModal').style.display = 'block';
    backToLink(); // Reset to initial view

    // Auto-search for existing similar stops could go here
    document.getElementById('stopSearch').value = targetString;
    filterStops();
}

function closeModal() {
    document.getElementById('linkModal').style.display = 'none';
    currentTargetString = '';
}

function switchToCreate() {
    document.getElementById('linkOptions').style.display = 'none';
    document.getElementById('createOptions').style.display = 'block';

    // Pre-fill
    document.getElementById('newStopName').value = currentTargetString;
    // Try to guess if it's a code
    if (/^\\d+$/.test(currentTargetString)) {
        document.getElementById('newStopCode').value = currentTargetString;
        document.getElementById('newStopName').value = '';
    }
}

function backToLink() {
    document.getElementById('linkOptions').style.display = 'block';
    document.getElementById('createOptions').style.display = 'none';
}

// Database Actions
async function confirmLink() {
    const stopId = document.getElementById('existingStopSelect').value;
    if (!stopId) {
        alert('Please select a stop');
        return;
    }

    try {
        const stopRef = db.collection('stops').doc(stopId);

        // Atomically add alias
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayUnion(currentTargetString)
        });

        // Batch update verified trips
        await batchVerifyTrips(currentTargetString, stopId);

        alert('Linked successfully!');
        closeModal();
        loadData(); // Refresh everything
    } catch (error) {
        console.error('Error linking:', error);
        alert('Error linking stop: ' + error.message);
    }
}

async function confirmCreate() {
    const name = document.getElementById('newStopName').value;
    const code = document.getElementById('newStopCode').value;
    const lat = parseFloat(document.getElementById('newStopLat').value);
    const lng = parseFloat(document.getElementById('newStopLng').value);
    const agency = document.getElementById('newStopAgency').value;

    if (!name && !code) { alert('Name or Code required'); return; }
    if (isNaN(lat) || isNaN(lng)) { alert('Valid Lat/Lng required'); return; }

    try {
        const docRef = await db.collection('stops').add({
            name: name,
            code: code,
            lat: lat,
            lng: lng,
            agency: agency,
            aliases: [currentTargetString], // Add the trigger string as first alias
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batchVerifyTrips(currentTargetString, docRef.id);

        alert('Created and linked successfully!');
        closeModal();
        loadData();
    } catch (error) {
        console.error('Error creating:', error);
        alert('Error: ' + error.message);
    }
}

async function batchVerifyTrips(rawString, stopId) {
    // 1. Get the authoritative stop data
    const stopDoc = await db.collection('stops').doc(stopId).get();
    const stopData = stopDoc.data();

    // 2. Query all unverified trips with this string
    const snapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('verified', '==', false)
        // Note: Firestore doesn't support logical OR in where clauses efficiently for this
        // We'll rely on the client-side filter or exact match
        .where('startStop', '==', rawString)
        .get();

    // 3. Update them
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            verified: true,
            startStopName: stopData.name, // Canonize the name
            boardingLocation: {
                lat: stopData.lat,
                lng: stopData.lng
            },
            verifiedStopId: stopId
        });
    });

    await batch.commit();
}

function openCreateModal() {
    // Manually open create modal without a link target
    document.getElementById('linkModal').style.display = 'block';
    switchToCreate();
    currentTargetString = ''; // No alias to add initially
}
