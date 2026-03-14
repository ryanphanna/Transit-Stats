import { auth, db } from './firebase.js';
import { UI } from './ui-utils.js';

const escapeHtml = UI.escapeHtml;
const escapeForJs = UI.escapeForJs;

console.log('🚀 TransitStats Admin Loading...');

// Global State
let stopsLibrary = [];
let pendingStops = [];
let filteredPendingStops = [];
let selectedInboxItems = new Set();
let currentTargetString = '';
let currentTargetVariants = []; // other spellings collapsed under currentTargetString
let pendingVariantsMap = {};    // normalized name → [variant spellings]
let currentUser = null;
let currentAliasTargetId = null;

// Input validation
function validateStopData(data) {
    const errors = [];

    if (!data.name || data.name.trim().length === 0) {
        errors.push('Stop name is required');
    }
    if (data.name && data.name.length > 200) {
        errors.push('Stop name must be less than 200 characters');
    }
    if (data.code && !/^\d+$/.test(data.code)) {
        errors.push('Stop code must contain only numbers');
    }
    if (data.code && data.code.length > 20) {
        errors.push('Stop code must be less than 20 characters');
    }
    if (data.agency && data.agency.length > 100) {
        errors.push('Agency name must be less than 100 characters');
    }
    if (data.lat && (isNaN(data.lat) || data.lat < -90 || data.lat > 90)) {
        errors.push('Latitude must be between -90 and 90');
    }
    if (data.lng && (isNaN(data.lng) || data.lng < -180 || data.lng > 180)) {
        errors.push('Longitude must be between -180 and 180');
    }
    if (data.direction && data.direction.length > 50) {
        errors.push('Direction must be less than 50 characters');
    }

    return errors;
}

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
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        // Check if user has admin privileges
        try {
            const docRef = db.collection('allowedUsers').doc(user.email.toLowerCase());
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                await auth.signOut();
                alert('Access denied. This app is invite-only.');
                return;
            }

            const userData = docSnap.data();
            if (!userData.isAdmin) {
                await auth.signOut();
                alert('Access denied. Admin privileges required.');
                return;
            }

            // User is authenticated and is an admin
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('adminContent').style.display = 'block';
            const userEmailEl = document.getElementById('userEmail');
            if (userEmailEl) userEmailEl.textContent = user.email;
            document.getElementById('userInfo').style.display = 'flex';

            loadData();
        } catch (error) {
            console.error('Error checking admin privileges:', error);
            await auth.signOut();
            alert('Error verifying admin access. Please try again.');
        }
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('adminContent').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
    }
});



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
        container.innerHTML = `<div class="empty-state" style="color: var(--danger-text);">Failed to load library: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadProvisionalStops() {
    try {
        const snapshot = await db.collection('trips')
            .where('userId', '==', currentUser.uid)
            .orderBy('startTime', 'desc')
            .limit(200)
            .get();

        // Group by normalized stop name → { route+direction → count }
        // Intersection variants ("Spadina & Nassau", "Spadina/nassau") collapse to one entry.
        const stopMap = {};  // key: normalized name → { routes, rawVariants }

        const addStop = (rawName, trip) => {
            if (!rawName || typeof rawName !== 'string') return;
            const trimmed = rawName.trim();
            if (!trimmed || findStopByAlias(trimmed)) return;
            // Also skip if the normalized form matches a library stop
            const normalized = normalizeIntersectionStop(trimmed);
            if (findStopByAlias(normalized)) return;

            if (!stopMap[normalized]) stopMap[normalized] = { routes: {}, rawVariants: new Set() };
            stopMap[normalized].rawVariants.add(trimmed);
            const routeKey = [trip.route, trip.direction].filter(Boolean).join(' ');
            stopMap[normalized].routes[routeKey] = (stopMap[normalized].routes[routeKey] || 0) + 1;
        };

        snapshot.docs.forEach(doc => {
            const trip = doc.data();
            addStop(trip.startStopName || trip.startStop, trip);
            addStop(trip.endStopName || trip.endStop, trip);
        });

        pendingVariantsMap = {};
        pendingStops = Object.entries(stopMap).map(([name, { routes, rawVariants }]) => {
            const totalCount = Object.values(routes).reduce((a, b) => a + b, 0);
            const routeList = Object.entries(routes)
                .sort((a, b) => b[1] - a[1])
                .map(([route, count]) => ({ route, count }));
            const suggestion = suggestCanonicalStop(name);
            const variants = [...rawVariants].filter(v => v !== name);
            pendingVariantsMap[name] = variants;
            return { name, routes: routeList, totalCount, suggestion, variants };
        }).sort((a, b) => b.totalCount - a.totalCount);

        filteredPendingStops = [...pendingStops];
        selectedInboxItems.clear();
        updateBulkActionsBar();
        renderPendingList();
        updatePendingCount();
    } catch (error) {
        console.error('Error loading pending:', error);
        const container = document.getElementById('pendingList');
        container.innerHTML = `<div class="empty-state" style="color: var(--danger-text);">Failed to load inbox: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Normalize intersection-format stops to a canonical form.
 * "Spadina & Nassau", "spadina/nassau" → "Spadina / Nassau"
 * Mirrors the same function in trips.js.
 */
function normalizeIntersectionStop(str) {
    if (!str) return str;
    const trimmed = str.trim();
    const titleCase = s => s.replace(/\b\w+/g, w =>
        ['at', 'and', 'the', 'of', 'for', 'on'].includes(w.toLowerCase())
            ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
    const codePrefix = trimmed.match(/^(\d{4,6})\s+(.+)$/);
    const core = codePrefix ? codePrefix[2] : trimmed;
    const intersectionMatch = core.match(/^(.+?)\s*(?:\/|&|\bat\b)\s*(.+)$/i);
    if (intersectionMatch) {
        const a = titleCase(intersectionMatch[1].trim());
        const b = titleCase(intersectionMatch[2].trim());
        const intersectionPart = `${a} / ${b}`;
        return codePrefix ? `${codePrefix[1]} ${intersectionPart}` : intersectionPart;
    }
    return codePrefix ? trimmed : titleCase(trimmed);
}

function findStopByAlias(str) {
    return stopsLibrary.find(stop =>
        (stop.name === str) ||
        (stop.code === str) ||
        (stop.aliases && stop.aliases.includes(str))
    );
}

const stopLookupCache = new Map();
/**
 * Fuzzy-match a raw stop string against the stops library.
 * Catches abbreviations, missing spaces, and partial names.
 * Returns { stop, confidence (0-100) } or null if no good match.
 */
function suggestCanonicalStop(rawName) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normRaw = norm(rawName);
    if (!normRaw) return null;

    if (stopLookupCache.has(normRaw)) return stopLookupCache.get(normRaw);

    let bestMatch = null;
    let bestScore = 0;

    for (const stop of stopsLibrary) {
        const candidates = [stop.name, ...(stop.aliases || [])];
        for (const candidate of candidates) {
            const normCand = norm(candidate);
            if (!normCand) continue;

            let score = 0;
            if (normRaw === normCand) {
                score = 1.0;
            } else if (normCand.startsWith(normRaw) || normRaw.startsWith(normCand)) {
                const shorter = Math.min(normRaw.length, normCand.length);
                const longer = Math.max(normRaw.length, normCand.length);
                score = 0.9 * (shorter / longer) + 0.05;
            } else if (normCand.includes(normRaw) || normRaw.includes(normCand)) {
                const shorter = Math.min(normRaw.length, normCand.length);
                const longer = Math.max(normRaw.length, normCand.length);
                score = 0.7 * (shorter / longer);
            } else {
                const tokA = rawName.toLowerCase().match(/[a-z0-9]+/g) || [];
                const tokB = candidate.toLowerCase().match(/[a-z0-9]+/g) || [];
                const setB = new Set(tokB);
                const intersection = tokA.filter(t => setB.has(t)).length;
                const union = new Set([...tokA, ...tokB]).size;
                score = union > 0 ? intersection / union : 0;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = stop;
                if (score === 1.0) break;
            }
        }
        if (bestScore === 1.0) break;
    }

    const result = bestScore >= 0.65 ? { stop: bestMatch, confidence: Math.round(bestScore * 100) } : null;
    stopLookupCache.set(normRaw, result);
    return result;
}

// Rendering
function renderStopLibrary(stops) {
    const container = document.getElementById('stopLibrary');
    if (stops.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching stops found.</div>';
        return;
    }

    container.innerHTML = stops.map(stop => {
        const safeName = escapeHtml(stop.name);
        const safeDirection = escapeHtml(stop.direction);
        const safeAgency = escapeHtml(stop.agency || 'Unknown');
        const safeCode = escapeHtml(stop.code);

        return `
        <div class="stop-card">
            <div class="stop-card-header">
                <div>
                    <h4>${safeName} ${stop.direction ? `<span style="font-size:0.8em; color:var(--text-secondary);">(${safeDirection})</span>` : ''} <span class="agency-badge" style="font-size:0.75em; opacity:0.8; font-weight:normal;">(${safeAgency})</span></h4>
                    <div class="stop-meta">
                        ${stop.code ? `<span class="badge" style="background:var(--bg-tertiary);">#${safeCode}</span>` : ''}
                        ${(stop.lat && stop.lng) ? `<span style="font-size: 0.8em; color: var(--text-muted);" title="Lat: ${stop.lat}, Lng: ${stop.lng}">📍 ${parseFloat(stop.lat).toFixed(4)}, ${parseFloat(stop.lng).toFixed(4)}</span>` : ''}
                    </div>
                </div>
            </div>

            ${renderAliases(stop)}

            <div style="margin-top: 15px; display:flex; justify-content:flex-end; align-items:center;">
                <button class="btn btn-sm btn-outline" style="padding:4px 10px; font-size:0.8em; border:none; color:var(--text-secondary);"
                    onclick="openStopForm('edit', {
                        id: '${escapeForJs(stop.id)}',
                        name: '${escapeForJs(stop.name)}',
                        code: '${escapeForJs(stop.code || '')}',
                        direction: '${escapeForJs(stop.direction || '')}',
                        agency: '${escapeForJs(stop.agency || 'Other')}',
                        lat: ${stop.lat || 0},
                        lng: ${stop.lng || 0},
                        aliases: ${escapeHtml(JSON.stringify(stop.aliases || []))}
                    })">
                    ✏️ Edit
                 </button>
            </div>
        </div>
    `;
    }).join('');
}

function renderAliases(stop) {
    if (!stop.aliases || stop.aliases.length === 0) {
        return '<div class="aliases-container" style="color:var(--text-muted); font-size:0.8em;">No variations linked</div>';
    }
    return `
        <div class="aliases-container">
            ${stop.aliases.map(a => `
                <span class="alias-badge">
                    ${escapeHtml(a)}
                    <span class="remove-alias" onclick="removeAlias('${escapeForJs(stop.id)}', '${escapeForJs(a)}')" title="Unlink variation">×</span>
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

    container.innerHTML = items.map(item => {
        const safeName = escapeHtml(item.name);

        const routeBreakdown = item.routes.map(r =>
            `<span style="font-size:0.78em; color:var(--text-secondary); margin-right:6px;">${escapeHtml(r.route)} <span style="opacity:0.6;">(${r.count})</span></span>`
        ).join('');

        const isHighConf = item.suggestion && item.suggestion.confidence >= 85;
        const suggestionHtml = item.suggestion ? `
            <div style="margin-top:5px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span style="font-size:0.8em; color:var(--text-secondary);">→ ${escapeHtml(item.suggestion.stop.name)}</span>
                <span style="font-size:0.75em; padding:1px 6px; border-radius:4px; background:${isHighConf ? '#dcfce7' : '#fef9c3'}; color:${isHighConf ? '#166534' : '#854d0e'};">${item.suggestion.confidence}%</span>
                <button class="btn btn-sm" style="font-size:0.78em; padding:2px 8px; background:var(--accent-electric); color:#fff; border:none; border-radius:4px; cursor:pointer;"
                    onclick="acceptSuggestion('${escapeForJs(item.name)}', '${item.suggestion.stop.id}')">Accept</button>
            </div>` : '';

        // Show collapsed variants (other spellings of the same intersection)
        const variantsHtml = item.variants && item.variants.length > 0 ? `
            <div style="margin-top:4px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                <span style="font-size:0.75em; color:var(--text-muted);">Also seen as:</span>
                ${item.variants.map(v => `<span style="font-size:0.75em; padding:1px 6px; border-radius:4px; background:var(--bg-tertiary); color:var(--text-secondary);">${escapeHtml(v)}</span>`).join('')}
            </div>` : '';

        return `
        <div class="inbox-item ${selectedInboxItems.has(item.name) ? 'selected' : ''}" data-name="${item.name.replace(/"/g, '&quot;')}">
            <div class="inbox-item-content">
                <input type="checkbox" class="inbox-item-checkbox"
                    ${selectedInboxItems.has(item.name) ? 'checked' : ''}
                    onchange="toggleInboxSelection('${escapeForJs(item.name)}')">
                <div style="overflow:hidden; flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="count-badge">${item.totalCount}</span>
                        <strong>${safeName}</strong>
                    </div>
                    <div style="margin-top:3px;">${routeBreakdown}</div>
                    ${variantsHtml}
                    ${suggestionHtml}
                </div>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
                ${item.totalCount > 1 ? `<button class="btn btn-outline btn-sm" onclick="openDivvyModal('${escapeForJs(item.name)}')" style="font-size:0.8em; padding:4px 8px;">Divvy Up</button>` : ''}
                <button class="btn btn-primary btn-sm" onclick="openLinkModal('${escapeForJs(item.name)}')">Link</button>
            </div>
        </div>
    `;
    }).join('');
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
            <div class="stop-search-result" onclick="selectStop('${stop.id}', '${escapeForJs(stop.name)}')"
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
    currentTargetVariants = pendingVariantsMap[targetString] || [];
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

    // Reset button to default state (for bulk/alias linking)
    const linkBtn = document.querySelector('#existingStopSearch button');
    if (linkBtn) {
        linkBtn.textContent = 'Link as Alias';
        linkBtn.setAttribute('onclick', 'confirmLink()');
    }
}

function closeModal() {
    document.getElementById('linkModal').style.display = 'none';
    currentTargetString = '';
    currentTargetVariants = [];
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
    try {
        const stopRef = db.collection('stops').doc(stopId);
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayRemove(alias)
        });

        await batchUnverifyTrips(alias, stopId);

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
        const allStrings = [currentTargetString, ...currentTargetVariants];
        const docRef = await db.collection('stops').add({
            name: name,
            code: code,
            direction: direction,
            lat: lat || 0,
            lng: lng || 0,
            agency: agency,
            aliases: allStrings,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        for (const s of allStrings) {
            await batchVerifyTrips(s, docRef.id);
        }

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

    // Query both field names — startStop (web legacy) and startStopName (SMS)
    const [startByStop, startByStopName, endByStop, endByStopName] = await Promise.all([
        db.collection('trips').where('userId', '==', currentUser.uid).where('startStop', '==', rawString).get(),
        db.collection('trips').where('userId', '==', currentUser.uid).where('startStopName', '==', rawString).get(),
        db.collection('trips').where('userId', '==', currentUser.uid).where('endStop', '==', rawString).get(),
        db.collection('trips').where('userId', '==', currentUser.uid).where('endStopName', '==', rawString).get(),
    ]);

    const batch = db.batch();
    let updateCount = 0;
    const seenStart = new Set();
    const seenEnd = new Set();

    [...startByStop.docs, ...startByStopName.docs].forEach(doc => {
        if (seenStart.has(doc.id)) return;
        seenStart.add(doc.id);
        batch.update(doc.ref, {
            verified: true,
            startStopName: stopData.name,
            boardingLocation: { lat: stopData.lat, lng: stopData.lng },
            verifiedStopId: stopId,
        });
        updateCount++;
    });

    [...endByStop.docs, ...endByStopName.docs].forEach(doc => {
        if (seenEnd.has(doc.id)) return;
        seenEnd.add(doc.id);
        batch.update(doc.ref, {
            endStopName: stopData.name,
            exitLocation: { lat: stopData.lat, lng: stopData.lng },
            verifiedEndId: stopId,
        });
        updateCount++;
    });

    if (updateCount > 0) {
        await batch.commit();
        console.log(`Updated ${updateCount} trips for "${rawString}".`);
    }
}

async function acceptSuggestion(rawString, stopId) {
    try {
        const variants = pendingVariantsMap[rawString] || [];
        const allStrings = [rawString, ...variants];
        await db.collection('stops').doc(stopId).update({
            aliases: firebase.firestore.FieldValue.arrayUnion(...allStrings)
        });
        for (const s of allStrings) {
            await batchVerifyTrips(s, stopId);
        }
        loadData();
    } catch (error) {
        console.error('Error accepting suggestion:', error);
        alert('Failed to accept: ' + error.message);
    }
}

async function acceptAllSuggestions() {
    const highConf = filteredPendingStops.filter(item => item.suggestion && item.suggestion.confidence >= 85);
    if (highConf.length === 0) {
        alert('No high-confidence suggestions to accept.');
        return;
    }
    if (!confirm(`Accept ${highConf.length} suggestion(s)?`)) return;
    for (const item of highConf) {
        await db.collection('stops').doc(item.suggestion.stop.id).update({
            aliases: firebase.firestore.FieldValue.arrayUnion(item.name)
        });
        await batchVerifyTrips(item.name, item.suggestion.stop.id);
    }
    loadData();
}

async function batchUnverifyTrips(rawString, stopId) {
    if (!rawString) return;

    // Find trips where this string was verified to THIS stop
    const startSnapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('startStop', '==', rawString)
        .where('verifiedStopId', '==', stopId)
        .get();

    const endSnapshot = await db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '==', rawString)
        .where('verifiedEndId', '==', stopId)
        .get();

    const batch = db.batch();
    let updateCount = 0;

    startSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            verified: false,
            startStopName: firebase.firestore.FieldValue.delete(),
            boardingLocation: firebase.firestore.FieldValue.delete(),
            verifiedStopId: firebase.firestore.FieldValue.delete()
        });
        updateCount++;
    });

    endSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
            endStopName: firebase.firestore.FieldValue.delete(),
            exitLocation: firebase.firestore.FieldValue.delete(),
            verifiedEndId: firebase.firestore.FieldValue.delete()
        });
        updateCount++;
    });

    if (updateCount > 0) {
        await batch.commit();
        console.log(`Unverified ${updateCount} trips for ${rawString}.`);
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
            // Single link mode — also resolve any collapsed spelling variants
            const allStrings = [currentTargetString, ...currentTargetVariants];
            await stopRef.update({
                aliases: firebase.firestore.FieldValue.arrayUnion(...allStrings)
            });
            for (const s of allStrings) {
                await batchVerifyTrips(s, stopId);
            }
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

function openStopForm(mode, stopData = null) {
    const modal = document.getElementById('stopFormModal');
    const title = document.getElementById('stopFormTitle');
    const saveBtn = document.getElementById('saveStopBtn');
    const deleteBtn = document.getElementById('deleteStopBtn');
    const aliasesSection = document.getElementById('editAliasesSection');

    modal.style.display = 'block';

    if (mode === 'edit' && stopData) {
        currentEditId = stopData.id;
        title.textContent = 'Edit Stop';
        saveBtn.textContent = 'Update Stop';
        if (deleteBtn) deleteBtn.style.display = 'block';

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
        if (deleteBtn) deleteBtn.style.display = 'none';

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
            <span class="remove-alias" onclick="removeAliasFromEdit('${stopId}', '${escapeForJs(a)}')" title="Remove alias" style="cursor: pointer; opacity: 0.5; font-weight: bold;">×</span>
        </span>
    `).join('');
}

async function removeAliasFromEdit(stopId, alias) {
    try {
        const stopRef = db.collection('stops').doc(stopId);
        await stopRef.update({
            aliases: firebase.firestore.FieldValue.arrayRemove(alias)
        });

        await batchUnverifyTrips(alias, stopId);

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

    // Validate input data
    const stopData = {
        name: name,
        code: code,
        direction: direction,
        lat: isNaN(lat) ? 0 : lat,
        lng: isNaN(lng) ? 0 : lng,
        agency: agency
    };

    const validationErrors = validateStopData(stopData);
    if (validationErrors.length > 0) {
        alert('Validation errors:\n\n' + validationErrors.join('\n'));
        return;
    }

    try {

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

async function deleteStop() {
    if (!currentEditId) return;

    try {
        await db.collection('stops').doc(currentEditId).delete();
        closeStopFormModal();
        loadData();
    } catch (error) {
        console.error('Error deleting stop:', error);
        alert('Error deleting stop: ' + error.message);
    }
}

// ========================================
// DIVVY UP LOGIC (Individual Trip Assignment)
// ========================================

async function openDivvyModal(targetString) {
    const modal = document.getElementById('divvyModal');
    const targetEl = document.getElementById('divvyTargetString');
    const listEl = document.getElementById('divvyTripsList');

    targetEl.textContent = targetString;
    modal.style.display = 'block';
    listEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Fetching trips...</div>';

    try {
        const startSnapshot = await db.collection('trips')
            .where('userId', '==', currentUser.uid)
            .where('startStop', '==', targetString)
            .get();

        const endSnapshot = await db.collection('trips')
            .where('userId', '==', currentUser.uid)
            .where('endStop', '==', targetString)
            .get();

        const allTrips = [];
        startSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.verifiedStopId) {
                allTrips.push({ id: doc.id, ...data, divvyType: 'start' });
            }
        });
        endSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.verifiedEndId) {
                allTrips.push({ id: doc.id, ...data, divvyType: 'end' });
            }
        });

        // Sort by time desc
        allTrips.sort((a, b) => b.startTime - a.startTime);

        renderDivvyTrips(allTrips, targetString);
    } catch (error) {
        console.error('Error loading divvy trips:', error);
        listEl.innerHTML = `<div style="color: var(--danger-text); text-align: center; padding: 20px;">Error: ${error.message}</div>`;
    }
}

function closeDivvyModal() {
    document.getElementById('divvyModal').style.display = 'none';
    activeDivvyTrip = null;
    loadProvisionalStops(); // Refresh inbox counts
}

function renderDivvyTrips(trips, targetString) {
    const container = document.getElementById('divvyTripsList');

    if (trips.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <div style="font-size: 2em; margin-bottom: 10px;">✨</div>
                <div>All trips with this name have been assigned!</div>
            </div>`;
        return;
    }

    container.innerHTML = trips.map(trip => {
        const dateObj = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
        const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const route = trip.route || 'Unknown Route';
        const isStart = trip.divvyType === 'start';

        return `
            <div style="background: var(--bg-primary); padding: 15px; border-radius: 10px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 0.75em; padding: 2px 6px; border-radius: 4px; background: ${isStart ? '#dcfce7' : '#fef9c3'}; color: ${isStart ? '#166534' : '#854d0e'}; font-weight: 700; text-transform: uppercase;">
                            ${isStart ? 'Boarding' : 'Exiting'}
                        </span>
                        <span style="font-weight: 600; font-size: 1.05em;">${route}</span>
                    </div>
                    <div style="font-size: 0.85em; color: var(--text-secondary);">
                        ${dateStr} at ${timeStr}
                    </div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="openSingleTripLink('${trip.id}', '${trip.divvyType}', '${escapeForJs(targetString)}')">
                    Assign
                </button>
            </div>
        `;
    }).join('');
}

let activeDivvyTrip = null;

function openSingleTripLink(tripId, type, rawString) {
    activeDivvyTrip = { id: tripId, type: type, rawString: rawString };

    // Reuse link modal
    openLinkModal(rawString);

    // Contextualize the button
    const linkBtn = document.querySelector('#existingStopSearch button');
    if (linkBtn) {
        linkBtn.textContent = 'Assign to this trip only';
        linkBtn.setAttribute('onclick', 'confirmSingleTripLink()');
    }
}

async function confirmSingleTripLink() {
    if (!selectedStopId || !activeDivvyTrip) {
        alert('Please select a stop first');
        return;
    }

    const { id, type, rawString } = activeDivvyTrip;

    try {
        const stopDoc = await db.collection('stops').doc(selectedStopId).get();
        const stopData = stopDoc.data();

        const updateData = {};
        if (type === 'start') {
            updateData.verified = true;
            updateData.startStopName = stopData.name;
            updateData.boardingLocation = { lat: stopData.lat, lng: stopData.lng };
            updateData.verifiedStopId = selectedStopId;
        } else {
            updateData.endStopName = stopData.name;
            updateData.exitLocation = { lat: stopData.lat, lng: stopData.lng };
            updateData.verifiedEndId = selectedStopId;
        }

        await db.collection('trips').doc(id).update(updateData);

        closeModal();
        // Refresh divvy list
        openDivvyModal(rawString);
    } catch (error) {
        console.error('Error assigning single trip:', error);
        alert('Failed to assign trip: ' + error.message);
    }
}
