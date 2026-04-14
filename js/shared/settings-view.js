import { auth, db } from '../firebase.js';

/**
 * SettingsView - Admin Telemetry rendering for the Settings page.
 */
export const SettingsView = {

    async renderTelemetry() {
        const container = document.getElementById('admin-insights-container');
        if (!container || !auth.currentUser) return;

        try {
            const doc = await db.collection('predictionAccuracy').doc(auth.currentUser.uid).get();
            if (!doc.exists) {
                container.innerHTML = '<div class="text-xs text-muted text-center p-2">No predictions recorded yet.</div>';
                return;
            }

            const d = doc.data();
            const routePct = d.total ? Math.round((d.hits / d.total) * 100) : 0;
            const endPct = d.endStopTotal ? Math.round((d.endStopHits / d.endStopTotal) * 100) : 0;

            container.innerHTML = `
                <div class="mb-3">
                    <div class="row-between">
                        <span class="settings-sub-label">Route prediction accuracy</span>
                        <span class="settings-main-label">${routePct}%</span>
                    </div>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill" style="width: 0%" id="bar-route"></div>
                    </div>
                    <div class="text-xxs text-muted mt-1">${d.hits} hits / ${d.total} samples</div>
                </div>
                <div>
                    <div class="row-between">
                        <span class="settings-sub-label">Exit stop accuracy</span>
                        <span class="settings-main-label">${endPct}%</span>
                    </div>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill" style="width: 0%" id="bar-end"></div>
                    </div>
                    <div class="text-xxs text-muted mt-1">${d.endStopHits} hits / ${d.endStopTotal} samples</div>
                </div>
            `;

            // Micro-animation for bars
            setTimeout(() => {
                const rBar = document.getElementById('bar-route');
                const eBar = document.getElementById('bar-end');
                if (rBar) rBar.style.width = `${routePct}%`;
                if (eBar) eBar.style.width = `${endPct}%`;
            }, 100);

        } catch (err) {
            container.innerHTML = '<div class="text-xs text-danger text-center p-2">Could not load accuracy data.</div>';
        }
    }
};
