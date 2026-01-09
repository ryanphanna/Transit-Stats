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
let filteredPendingStops = [];
let selectedInboxItems = new Set();
let currentTargetString = '';
let currentUser = null;
let currentAliasTargetId = null;

// Auth Listener
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
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
        const snapshot = await db.collection('trips')
            .where('verified', '==', false)
            .where('userId', '==', currentUser.uid)
            .limit(100)
            .get();

        const uniquePending = new Set();
        const pendingCounts = {};

        snapshot.docs.forEach(doc => {
            const trip = doc.data();
            const rawStop = trip.startStop || trip.startStopName || trip.startStopCode;
            if (rawStop && typeof rawStop === 'string') {
                const trimmed = rawStop.trim();
                uniquePending.add(trimmed);
                pendingCounts[trimmed] = (pendingCounts[trimmed] || 0) + 1;
            }
        });

        pendingStops = Array.from(uniquePending)
            .filter(str => !findStopByAlias(str))
            .map(str => ({ name: str, count: pendingCounts[str] }))
            .sort((a, b) => b.count - a.count);

        filteredPendingStops = [...pendingStops];
        selectedInboxItems.clear();
        updateBulkActionsBar();
        renderPendingList();
        updatePendingCount();
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
        container.innerHTML = '<div class="empty-state">No matching stops found.</div>';
        return;
    }

    container.innerHTML = stops.map(stop => `
        <div class="stop-card">
            <div class="stop-card-header">
                <div>
                    <h4>${stop.name} <span class="agency-badge" style="font-size:0.75em; opacity:0.8; font-weight:normal;">(${stop.agency || 'Unknown'})</span></h4>
                    <div class="stop-meta">
                        ${stop.code ? `<span class="badge" style="background:var(--bg-tertiary);">#${stop.code}</span>` : ''} 
                        <span title="Lat: ${stop.lat}, Lng: ${stop.lng}">📍 Location</span>
                    </div>
                </div>
            </div>
            
            ${renderAliases(stop)}
            
            <div style="margin-top: 15px; display:flex; justify-content:space-between; align-items:center;">
                 <button class="btn btn-primary" style="padding:4px 10px; font-size:0.8em;" onclick="openManualAliasModal('${stop.id}', '${stop.name.replace(/'/g, "\\'")}')">
                    + Alias
                 </button>
            </div>
        </div>
    `).join('');
}

function renderAliases(stop) {
    if (!stop.aliases || stop.aliases.length === 0) {
        return '<div class="aliases-container" style="color:var(--text-muted); font-size:0.8em;">No variations linked</div>';
    }
    return `
        <div class="aliases-container">
            ${stop.aliases.map(a => `
                <span class="alias-badge">
                    ${a} 
                    <span class="remove-alias" onclick="removeAlias('${stop.id}', '${a.replace(/'/g, "\\'")}')" title="Remove alias">×</span>
                </span>
            `).join('')}
        </div>
    `;
}

function renderPendingList(itemsToRender = null) {
    const container = document.getElementById('pendingList');
    const items = itemsToRender || filteredPendingStops;

    if (items.length === 0) {
        const isFiltered = document.getElementById('inboxSearch')?.value.trim();
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
                <div style="font-size: 2em; margin-bottom: 10px;">${isFiltered ? '🔍' : '🎉'}</div>
                <div>${isFiltered ? 'No matches found' : 'All caught up!'}</div>
                <div style="font-size: 0.8em;">${isFiltered ? 'Try a different search term' : 'No unlinked stops found.'}</div>
            </div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="inbox-item ${selectedInboxItems.has(item.name) ? 'selected' : ''}" data-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="inbox-item-content">
                <input type="checkbox" class="inbox-item-checkbox"
                    ${selectedInboxItems.has(item.name) ? 'checked' : ''}
                    onchange="toggleInboxSelection('${item.name.replace(/'/g, "\\'")}')">
                <div style="overflow:hidden; text-overflow:ellipsis; flex: 1;">
                    <span class="count-badge">${item.count}</span>
                    <strong>${item.name}</strong>
                </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openLinkModal('${item.name.replace(/'/g, "\\'")}')">Link</button>
        </div>
    `).join('');
}

function updatePendingCount() {
    const count = pendingStops.length;
    const badge = document.getElementById('pendingCount');
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function filterStops() {
    const query = document.getElementById('stopSearch').value.toLowerCase();
    const agency = document.getElementById('agencyFilter').value;

    const filtered = stopsLibrary.filter(stop => {
        const matchesSearch = stop.name.toLowerCase().includes(query) ||
            (stop.code && stop.code.toLowerCase().includes(query)) ||
            (stop.aliases && stop.aliases.some(a => a.toLowerCase().includes(query)));

        const matchesAgency = agency === 'All' || stop.agency === agency;

        return matchesSearch && matchesAgency;
    });
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

    document.getElementById('newStopName').value = currentTargetString;
    if (/^\\d+$/.test(currentTargetString)) {
        document.getElementById('newStopCode').value = currentTargetString;
        document.getElementById('newStopName').value = '';
    }
}

function backToLink() {
    document.getElementById('linkOptions').style.display = 'block';
    document.getElementById('createOptions').style.display = 'none';
}

function openManualAliasModal(stopId, stopName) {
    currentAliasTargetId = stopId;
    document.getElementById('aliasTargetName').textContent = stopName;
    document.getElementById('newAliasInput').value = '';
    document.getElementById('manualAliasModal').style.display = 'block';
    document.getElementById('newAliasInput').focus();
}

async function saveManualAlias() {
    const alias = document.getElementById('newAliasInput').value.trim();
    if (!alias) return;

    try {
        const stopRef = db.collection('stops').doc(currentAliasTargetId);
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayUnion(alias)
        });

        await batchVerifyTrips(alias, currentAliasTargetId);

        document.getElementById('manualAliasModal').style.display = 'none';
        loadData();
    } catch (error) {
        console.error('Error adding alias:', error);
        alert('Failed to add alias: ' + error.message);
    }
}

async function removeAlias(stopId, alias) {
    if (!confirm(`Remove alias "${alias}"? This will not un-verify past trips.`)) return;

    try {
        const stopRef = db.collection('stops').doc(stopId);
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayRemove(alias)
        });
        loadData();
    } catch (error) {
        console.error('Error removing alias:', error);
        alert('Failed to remove alias');
    }
}

async function confirmCreate() {
    const name = document.getElementById('newStopName').value;
    const code = document.getElementById('newStopCode').value;
    const lat = parseFloat(document.getElementById('newStopLat').value);
    const lng = parseFloat(document.getElementById('newStopLng').value);
    const agency = document.getElementById('newStopAgency').value;

    if (!name && !code) { alert('Name or Code required'); return; }

    try {
        const docRef = await db.collection('stops').add({
            name: name,
            code: code,
            lat: lat || 0,
            lng: lng || 0,
            agency: agency,
            aliases: [currentTargetString],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batchVerifyTrips(currentTargetString, docRef.id);

        closeModal();
        loadData();
    } catch (error) {
        console.error('Error creating:', error);
        alert('Error: ' + error.message);
    }
}

async function batchVerifyTrips(rawString, stopId) {
    if (!rawString) return;

    const stopDoc = await db.collection('stops').doc(stopId).get();
    const stopData = stopDoc.data();

    const snapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('verified', '==', false)
        .get();

    const toUpdate = snapshot.docs.filter(d => {
        const t = d.data();
        const raw = t.startStop || t.startStopName || t.startStopCode;
        return raw === rawString;
    });

    const batch = db.batch();
    toUpdate.forEach(doc => {
        batch.update(doc.ref, {
            verified: true,
            startStopName: stopData.name,
            boardingLocation: {
                lat: stopData.lat,
                lng: stopData.lng
            },
            verifiedStopId: stopId
        });
    });

    if (toUpdate.length > 0) {
        await batch.commit();
        console.log(`Verified ${toUpdate.length} trips.`);
    }
}

// ========================================
// INBOX SEARCH & BULK SELECT FUNCTIONS
// ========================================

function filterInbox() {
    const query = document.getElementById('inboxSearch').value.toLowerCase().trim();

    if (!query) {
        filteredPendingStops = [...pendingStops];
    } else {
        filteredPendingStops = pendingStops.filter(item =>
            item.name.toLowerCase().includes(query)
        );
    }

    renderPendingList();
}

function toggleInboxSelection(name) {
    if (selectedInboxItems.has(name)) {
        selectedInboxItems.delete(name);
    } else {
        selectedInboxItems.add(name);
    }

    updateBulkActionsBar();
    updateSelectAllCheckbox();

    // Update the item's visual state
    const item = document.querySelector(`.inbox-item[data-name="${name.replace(/"/g, '\\"')}"]`);
    if (item) {
        item.classList.toggle('selected', selectedInboxItems.has(name));
    }
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllInbox');

    if (selectAllCheckbox.checked) {
        // Select all visible (filtered) items
        filteredPendingStops.forEach(item => selectedInboxItems.add(item.name));
    } else {
        // Deselect all
        selectedInboxItems.clear();
    }

    updateBulkActionsBar();
    renderPendingList();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllInbox');
    if (!selectAllCheckbox) return;

    const allSelected = filteredPendingStops.length > 0 &&
        filteredPendingStops.every(item => selectedInboxItems.has(item.name));

    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = !allSelected && selectedInboxItems.size > 0;
}

function updateBulkActionsBar() {
    const bar = document.getElementById('bulkActionsBar');
    const countSpan = document.getElementById('selectedCount');

    if (!bar || !countSpan) return;

    if (selectedInboxItems.size > 0) {
        bar.style.display = 'block';
        countSpan.textContent = `${selectedInboxItems.size} selected`;
    } else {
        bar.style.display = 'none';
    }
}

function clearSelection() {
    selectedInboxItems.clear();
    updateBulkActionsBar();
    updateSelectAllCheckbox();
    renderPendingList();
}

async function bulkLinkSelected() {
    if (selectedInboxItems.size === 0) {
        alert('No items selected');
        return;
    }

    const stopId = document.getElementById('existingStopSelect').value;

    if (!stopId) {
        // Open a modal to select a stop to link all selected items to
        const selectedArray = Array.from(selectedInboxItems);
        const firstItem = selectedArray[0];

        // Show modal with first item, but we'll link all
        currentTargetString = firstItem;
        document.getElementById('modalTargetString').innerHTML = `
            <div style="margin-bottom: 8px;">${firstItem}</div>
            ${selectedArray.length > 1 ? `<div style="font-size: 0.85em; color: var(--text-muted);">+ ${selectedArray.length - 1} more items</div>` : ''}
        `;
        document.getElementById('linkModal').style.display = 'block';

        // Store the bulk mode flag
        window.bulkLinkMode = true;
        window.bulkLinkItems = selectedArray;

        document.getElementById('stopSearch').value = '';
        filterStops();
        return;
    }
}

// confirmLink supports both single and bulk mode
async function confirmLink() {
    const stopId = document.getElementById('existingStopSelect').value;
    if (!stopId) {
        alert('Please select a stop');
        return;
    }

    try {
        const stopRef = db.collection('stops').doc(stopId);

        if (window.bulkLinkMode && window.bulkLinkItems) {
            // Bulk link mode
            for (const itemName of window.bulkLinkItems) {
                await stopRef.update({
                    aliases: firebase.firestore.FieldValue.arrayUnion(itemName)
                });
                await batchVerifyTrips(itemName, stopId);
            }

            window.bulkLinkMode = false;
            window.bulkLinkItems = null;
            selectedInboxItems.clear();
        } else {
            // Single link mode
            await stopRef.update({
                aliases: firebase.firestore.FieldValue.arrayUnion(currentTargetString)
            });
            await batchVerifyTrips(currentTargetString, stopId);
        }

        closeModal();
        loadData();
    } catch (error) {
        console.error('Error linking:', error);
        alert('Error linking stop: ' + error.message);
    }
}
