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

// Theme - Load saved theme from localStorage (shared with main app)
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
    }
}

// Load theme immediately
loadSavedTheme();

// Auth Listener
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (user) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('adminContent').style.display = 'block';
        const userEmailEl = document.getElementById('userEmail');
        if (userEmailEl) userEmailEl.textContent = user.email;
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

async function loadData() {
    await loadStopLibrary();
    await loadProvisionalStops();
}

async function loadStopLibrary() {
    try {
        const snapshot = await db.collection('stops').orderBy('name').get();
        stopsLibrary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderStopLibrary(stopsLibrary);
        updateStopSelect();
    } catch (error) {
        console.error('Error loading lib:', error);
        const container = document.getElementById('stopLibrary');
        container.innerHTML = `<div class="empty-state" style="color: var(--danger-text);">Failed to load library: ${error.message}</div>`;
    }
}

async function loadProvisionalStops() {
    try {
        const snapshot = await db.collection('trips')
            .where('userId', '==', currentUser.uid)
            .orderBy('startTime', 'desc')
            .limit(100)
            .get();

        const uniquePending = new Set();
        const pendingCounts = {};

        snapshot.docs.forEach(doc => {
            const trip = doc.data();

            // Check Start Stop
            const startRaw = trip.startStop || trip.startStopName || trip.startStopCode;
            if (startRaw && typeof startRaw === 'string') {
                const trimmed = startRaw.trim();
                uniquePending.add(trimmed);
                pendingCounts[trimmed] = (pendingCounts[trimmed] || 0) + 1;
            }

            // Check End Stop
            const endRaw = trip.endStop || trip.endStopName || trip.endStopCode;
            if (endRaw && typeof endRaw === 'string') {
                const trimmed = endRaw.trim();
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
        const container = document.getElementById('pendingList');
        container.innerHTML = `<div class="empty-state" style="color: var(--danger-text);">Failed to load inbox: ${error.message}</div>`;
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
                    <h4>${stop.name} ${stop.direction ? `<span style="font-size:0.8em; color:var(--text-secondary);">(${stop.direction})</span>` : ''} <span class="agency-badge" style="font-size:0.75em; opacity:0.8; font-weight:normal;">(${stop.agency || 'Unknown'})</span></h4>
                    <div class="stop-meta">
                        ${stop.code ? `<span class="badge" style="background:var(--bg-tertiary);">#${stop.code}</span>` : ''}
                        ${(stop.lat && stop.lng) ? `<span style="font-size: 0.8em; color: var(--text-muted);" title="Lat: ${stop.lat}, Lng: ${stop.lng}">📍 ${parseFloat(stop.lat).toFixed(4)}, ${parseFloat(stop.lng).toFixed(4)}</span>` : ''}
                    </div>
                </div>
            </div>

            ${renderAliases(stop)}

            <div style="margin-top: 15px; display:flex; justify-content:flex-end; align-items:center;">
                <button class="btn btn-sm btn-outline" style="padding:4px 10px; font-size:0.8em; border:none; color:var(--text-secondary);"
                    onclick="editStopById('${stop.id}')">
                    ✏️ Edit
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
                <span class="alias-badge">${a}</span>
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
    const sort = document.getElementById('stopSort').value;

    const filtered = stopsLibrary.filter(stop => {
        const matchesSearch = stop.name.toLowerCase().includes(query) ||
            (stop.code && stop.code.toLowerCase().includes(query)) ||
            (stop.aliases && stop.aliases.some(a => a.toLowerCase().includes(query)));

        const matchesAgency = agency === 'All' || stop.agency === agency;

        return matchesSearch && matchesAgency;
    });

    // Sort results
    filtered.sort((a, b) => {
        if (sort === 'nameAsc') return a.name.localeCompare(b.name);
        if (sort === 'nameDesc') return b.name.localeCompare(a.name);
        if (sort === 'agencyAsc') {
            const agencyCompare = a.agency.localeCompare(b.agency);
            return agencyCompare !== 0 ? agencyCompare : a.name.localeCompare(b.name);
        }
        return 0;
    });

    renderStopLibrary(filtered);
}

let selectedStopId = null;

function updateStopSelect() {
    // Legacy function - kept for compatibility but no longer uses dropdown
}

function showLinkExisting() {
    document.getElementById('existingStopSearch').style.display = 'block';
    document.getElementById('stopSearchInput').focus();
    document.getElementById('linkExistingBtn').classList.add('active');
    document.getElementById('linkExistingBtn').style.background = 'rgba(255, 255, 255, 0.3)';
    document.getElementById('createNewBtn').classList.remove('active');
}

function filterStopSearch() {
    const query = document.getElementById('stopSearchInput').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('stopSearchResults');

    if (!query) {
        resultsContainer.style.display = 'none';
        return;
    }

    const filtered = stopsLibrary.filter(stop =>
        stop.name.toLowerCase().includes(query) ||
        (stop.code && stop.code.toLowerCase().includes(query)) ||
        (stop.aliases && stop.aliases.some(a => a.toLowerCase().includes(query)))
    ).slice(0, 10);

    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted);">No stops found</div>';
    } else {
        resultsContainer.innerHTML = filtered.map(stop => `
            <div class="stop-search-result" onclick="selectStop('${stop.id}', '${stop.name.replace(/'/g, "\\'")}')"
                style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border-light); transition: background 0.15s;"
                onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='transparent'">
                <div style="font-weight: 500;">${stop.name}</div>
                <div style="font-size: 0.85em; color: var(--text-secondary);">${stop.agency}${stop.code ? ' • #' + stop.code : ''}</div>
            </div>
        `).join('');
    }

    resultsContainer.style.display = 'block';
}

function showStopResults() {
    const query = document.getElementById('stopSearchInput').value.trim();
    if (query) {
        filterStopSearch();
    }
}

function selectStop(stopId, stopName) {
    selectedStopId = stopId;
    document.getElementById('stopSearchInput').value = stopName;
    document.getElementById('stopSearchResults').style.display = 'none';
}

// Modal Logic
function openLinkModal(targetString) {
    currentTargetString = targetString;
    selectedStopId = null;
    document.getElementById('modalTargetString').textContent = targetString;
    document.getElementById('linkModal').style.display = 'block';
    document.getElementById('linkOptions').style.display = 'block';
    document.getElementById('existingStopSearch').style.display = 'none';
    document.getElementById('stopSearchInput').value = '';
    document.getElementById('stopSearchResults').style.display = 'none';
    document.getElementById('linkExistingBtn').style.background = '';
    document.getElementById('linkExistingBtn').classList.remove('active');
    document.getElementById('createNewBtn').classList.remove('active');
    document.getElementById('createNewView').style.display = 'none';
}

function closeModal() {
    document.getElementById('linkModal').style.display = 'none';
    currentTargetString = '';
}

function backToChoice() {
    // Show the link options with both buttons
    document.getElementById('linkOptions').style.display = 'block';
    document.getElementById('existingStopSearch').style.display = 'none';
    document.getElementById('createNewView').style.display = 'none';
    // Reset button styles
    document.getElementById('linkExistingBtn').classList.remove('active');
    document.getElementById('linkExistingBtn').style.background = '';
    document.getElementById('createNewBtn').classList.remove('active');
}

function showCreateNew() {
    // Hide link options and show create form
    document.getElementById('linkOptions').style.display = 'none';
    document.getElementById('createNewView').style.display = 'block';

    document.getElementById('newStopName').value = currentTargetString;
    if (/^\d+$/.test(currentTargetString)) {
        document.getElementById('newStopCode').value = currentTargetString;
        document.getElementById('newStopName').value = '';
    }
}

// Helper to filter stops in the Link Existing view
function filterLinkStops() {
    const query = document.getElementById('existingStopSearch').value.toLowerCase();
    const select = document.getElementById('existingStopSelect');

    const filtered = stopsLibrary.filter(stop => {
        return stop.name.toLowerCase().includes(query) ||
            (stop.code && stop.code.toLowerCase().includes(query)) ||
            (stop.aliases && stop.aliases.some(a => a.toLowerCase().includes(query)));
    });

    select.innerHTML = '<option value="">Select a stop...</option>' +
        filtered.map(s => `<option value="${s.id}">${s.name} (${s.agency})</option>`).join('');
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
    const direction = document.getElementById('newStopDirection').value || null;
    const lat = parseFloat(document.getElementById('newStopLat').value);
    const lng = parseFloat(document.getElementById('newStopLng').value);
    const agency = document.getElementById('newStopAgency').value;

    if (!name && !code) { alert('Name or Code required'); return; }

    try {
        const docRef = await db.collection('stops').add({
            name: name,
            code: code,
            direction: direction,
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

    // Find trips where this string is the Start Stop
    const startSnapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('startStop', '==', rawString)
        .get();

    // Find trips where this string is the End Stop
    const endSnapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '==', rawString)
        .get();

    const batch = db.batch();
    let updateCount = 0;

    // Update Start Stops
    startSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            verified: true,
            startStopName: stopData.name,
            boardingLocation: {
                lat: stopData.lat,
                lng: stopData.lng
            },
            verifiedStopId: stopId
        });
        updateCount++;
    });

    // Update End Stops
    endSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            // We don't necessarily mark verified=true just for end stop unless start is also known, 
            // but for now let's assume if we are linking data we are improving verification status.
            // If the start stop was unknown, it remains unknown, but at least we fix the end stop.
            endStopName: stopData.name,
            exitLocation: {
                lat: stopData.lat,
                lng: stopData.lng
            },
            verifiedEndId: stopId
        });
        updateCount++;
    });

    if (updateCount > 0) {
        await batch.commit();
        console.log(`Updated ${updateCount} trips (Start/End set to ${rawString}).`);
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

    // Open a modal to select a stop to link all selected items to
    const selectedArray = Array.from(selectedInboxItems);
    const firstItem = selectedArray[0];

    // Show modal with first item, but we'll link all
    currentTargetString = firstItem;
    selectedStopId = null;
    document.getElementById('modalTargetString').innerHTML = `
        <div style="margin-bottom: 8px;">${firstItem}</div>
        ${selectedArray.length > 1 ? `<div style="font-size: 0.85em; color: var(--text-muted);">+ ${selectedArray.length - 1} more items</div>` : ''}
    `;
    document.getElementById('linkModal').style.display = 'block';
    document.getElementById('linkOptions').style.display = 'block';
    document.getElementById('createOptions').style.display = 'none';
    document.getElementById('existingStopSearch').style.display = 'none';
    document.getElementById('stopSearchInput').value = '';
    document.getElementById('stopSearchResults').style.display = 'none';
    document.getElementById('linkExistingBtn').style.background = '';

    // Store the bulk mode flag
    window.bulkLinkMode = true;
    window.bulkLinkItems = selectedArray;

    document.getElementById('stopSearch').value = '';
    filterStops();
}

// confirmLink supports both single and bulk mode
async function confirmLink() {
    const stopId = selectedStopId;
    if (!stopId) {
        alert('Please search and select a stop first');
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

// ========================================
// STOP FORM MODAL (Create/Edit)
// ========================================

let currentEditId = null;

/**
 * Edit a stop by its ID - fetches from loaded stopsLibrary
 */
function editStopById(stopId) {
    const stop = stopsLibrary.find(s => s.id === stopId);
    if (!stop) {
        alert('Stop not found. Try refreshing the page.');
        return;
    }
    openStopForm('edit', stop);
}

function openStopForm(mode, stopData = null) {
    const modal = document.getElementById('stopFormModal');
    const title = document.getElementById('stopFormTitle');
    const saveBtn = document.getElementById('saveStopBtn');
    const aliasesSection = document.getElementById('editAliasesSection');

    modal.style.display = 'block';

    if (mode === 'edit' && stopData) {
        currentEditId = stopData.id;
        title.textContent = 'Edit Stop';
        saveBtn.textContent = 'Update Stop';

        document.getElementById('editStopName').value = stopData.name || '';
        document.getElementById('editStopCode').value = stopData.code || '';
        document.getElementById('editStopDirection').value = stopData.direction || '';
        document.getElementById('editStopLat').value = stopData.lat || '';
        document.getElementById('editStopLng').value = stopData.lng || '';
        document.getElementById('editStopAgency').value = stopData.agency || 'Other';

        // Show aliases section and render aliases
        if (stopData.aliases && stopData.aliases.length > 0) {
            aliasesSection.style.display = 'block';
            renderEditAliases(stopData.id, stopData.aliases);
        } else {
            aliasesSection.style.display = 'block';
            document.getElementById('editAliasesList').innerHTML = '<span style="color: var(--text-muted); font-size: 0.9em;">No aliases linked</span>';
        }
    } else {
        // Create mode
        currentEditId = null;
        title.textContent = 'Create New Stop';
        saveBtn.textContent = 'Create Stop';

        document.getElementById('editStopName').value = '';
        document.getElementById('editStopCode').value = '';
        document.getElementById('editStopDirection').value = '';
        document.getElementById('editStopLat').value = '';
        document.getElementById('editStopLng').value = '';
        document.getElementById('editStopAgency').value = 'TTC'; // Default

        // Hide aliases section in create mode
        aliasesSection.style.display = 'none';
    }
}

function renderEditAliases(stopId, aliases) {
    const container = document.getElementById('editAliasesList');
    if (!aliases || aliases.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9em;">No aliases linked</span>';
        return;
    }
    container.innerHTML = aliases.map(a => `
        <span class="alias-badge" style="display: flex; align-items: center; gap: 4px;">
            ${a}
            <span class="remove-alias" onclick="removeAliasFromEdit('${stopId}', '${a.replace(/'/g, "\\'")}')" title="Remove alias" style="cursor: pointer; opacity: 0.5; font-weight: bold;">×</span>
        </span>
    `).join('');
}

async function removeAliasFromEdit(stopId, alias) {
    if (!confirm(`Remove alias "${alias}"? This will not un-verify past trips.`)) return;

    try {
        const stopRef = db.collection('stops').doc(stopId);
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayRemove(alias)
        });

        // Refresh the aliases in the edit modal
        const stopDoc = await stopRef.get();
        const stopData = stopDoc.data();
        renderEditAliases(stopId, stopData.aliases || []);

        // Also refresh the main library view
        loadData();
    } catch (error) {
        console.error('Error removing alias:', error);
        alert('Failed to remove alias');
    }
}

function closeStopFormModal() {
    document.getElementById('stopFormModal').style.display = 'none';
    currentEditId = null;
}

async function saveStopFromForm() {
    const name = document.getElementById('editStopName').value.trim();
    const code = document.getElementById('editStopCode').value.trim();
    const direction = document.getElementById('editStopDirection').value || null;
    const lat = parseFloat(document.getElementById('editStopLat').value);
    const lng = parseFloat(document.getElementById('editStopLng').value);
    const agency = document.getElementById('editStopAgency').value;

    if (!name) {
        alert('Stop name is required');
        return;
    }

    try {
        const stopData = {
            name: name,
            code: code,
            direction: direction,
            lat: isNaN(lat) ? 0 : lat,
            lng: isNaN(lng) ? 0 : lng,
            agency: agency
        };

        if (currentEditId) {
            // Update existing
            await db.collection('stops').doc(currentEditId).update(stopData);

            // Also update any trips using this stop ID where data is denormalized?
            // The batchVerifyTrips updates verified trips. If we change the Name of a stop, we might want to propagate that?
            // For now, let's keep it simple. If name changes, historical trips might keep old name in 'startStopName' unless re-verified.
            // But let's trigger a re-verify just in case if name changed?
            // It's expensive. Let's start with just updating the Doc.
        } else {
            // Create new
            stopData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            stopData.aliases = []; // Start with no aliases
            await db.collection('stops').add(stopData);
        }

        closeStopFormModal();
        loadData(); // Refresh library
    } catch (error) {
        console.error('Error saving stop:', error);
        alert('Error saving stop: ' + error.message);
    }
}
