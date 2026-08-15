const ADMIN_METRICS_URL = 'https://us-central1-transitstats-21ba4.cloudfunctions.net/adminMetrics';

function number(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function metric(label, value, detail = '') {
    return `
        <div class="admin-metric">
            <span class="admin-metric-label">${label}</span>
            <strong class="admin-metric-value">${number(value)}</strong>
            ${detail ? `<span class="admin-metric-detail">${detail}</span>` : ''}
        </div>`;
}

function renderMetrics(container, metrics) {
    const { accounts, rides, stops, intelligence } = metrics;
    container.innerHTML = `
        <div class="admin-metric-group">
            <span class="admin-metric-group-label">Accounts</span>
            <div class="admin-metric-grid">
                ${metric('Users', accounts.total, `${number(accounts.admins)} admin`)}
                ${metric('Logins', accounts.totalLogins, `${number(accounts.activeLogins30d)} in 30 days`)}
                ${metric('Experimental models', accounts.experimentalIntelligence, 'users enabled')}
            </div>
        </div>
        <div class="admin-metric-group">
            <span class="admin-metric-group-label">Processing</span>
            <div class="admin-metric-grid">
                ${metric('Rides', rides.total, `${number(rides.completed)} completed`)}
                ${metric('Awaiting finalization', rides.awaitingFinalization, 'completed rides')}
                ${metric('Questions', intelligence.questions, 'AI queries')}
            </div>
        </div>
        <div class="admin-metric-group">
            <span class="admin-metric-group-label">Stop quality</span>
            <div class="admin-metric-grid">
                ${metric('Stops in library', stops.library, `${number(stops.verified)} verified`)}
                ${metric('Matched rides', stops.matchedTrips, 'both ends recognized')}
                ${metric('Needs matching', stops.unmatchedTrips, 'at least one end unresolved')}
            </div>
        </div>
        <div class="admin-metric-group">
            <span class="admin-metric-group-label">Prediction grading</span>
            <div class="admin-metric-grid">
                ${metric('Graded predictions', intelligence.predictionRows, `${number(intelligence.v3Rows)} V3`)}
                ${metric('V4 rows', intelligence.v4Rows, 'experimental')}
                ${metric('V5 rows', intelligence.v5Rows, 'experimental')}
            </div>
        </div>
        <p class="admin-metrics-footnote">
            Matched and unresolved counts refer to completed rides, because the stored match flag is finalized when a ride ends.
            ${number(stops.unknownMatchTrips)} completed rides have no recorded match status.
        </p>
    `;
}

export async function loadAdminMetrics(container) {
    if (!container) return;
    const user = window.currentUser;
    if (!user) {
        container.innerHTML = '<p class="admin-metrics-empty">Admin session unavailable.</p>';
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch(ADMIN_METRICS_URL, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
        renderMetrics(container, data);
        const updated = document.querySelector('[data-admin-metrics-updated]');
        if (updated && data.generatedAt) {
            updated.textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        }
    } catch (error) {
        console.error('Admin metrics load failed:', error);
        container.innerHTML = '<p class="admin-metrics-empty">Metrics are temporarily unavailable.</p>';
    }
}
