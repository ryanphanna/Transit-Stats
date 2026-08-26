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
        ${metric('Users', accounts.total, `${number(accounts.activeLogins30d)} active in 30 days`)}
        ${metric('Rides', rides.total, `${number(rides.completed)} completed`)}
        ${metric('Stops', stops.library, `${number(stops.verified)} verified`)}
        ${metric('Needs matching', stops.unmatchedTrips, 'completed rides')}
        ${metric('AI questions', intelligence.questions, `${number(intelligence.predictionRows)} prediction records`)}
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
