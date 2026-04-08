import { auth, db } from '../firebase.js';
import { Profile } from '../profile.js';
import { UI } from '../ui-utils.js';
import { ModalManager } from './modal-engine.js';

/**
 * SettingsView - Manages the Settings modal, Profile syncing, and Admin Telemetry.
 */
export const SettingsView = {
    async open(isAdmin) {
        ModalManager.open('modal-settings');
        
        const email = auth.currentUser?.email || '';
        if (email) await Profile.syncUI(email);
        
        if (isAdmin) {
            this.renderTelemetry();
        }
    },

    async renderTelemetry() {
        const container = document.getElementById('admin-insights-container');
        if (!container || !auth.currentUser) return;

        try {
            const doc = await db.collection('predictionAccuracy').doc(auth.currentUser.uid).get();
            if (!doc.exists) {
                container.innerHTML = '<div class="text-xs text-muted text-center p-2">No telemetry recorded yet.</div>';
                return;
            }

            const d = doc.data();
            const routePct = d.total ? Math.round((d.hits / d.total) * 100) : 0;
            const endPct = d.endStopTotal ? Math.round((d.endStopHits / d.endStopTotal) * 100) : 0;

            container.innerHTML = `
                <div class="mb-3">
                    <div class="row-between">
                        <span class="settings-sub-label">Route Signal Accuracy</span>
                        <span class="settings-main-label">${routePct}%</span>
                    </div>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill" style="width: 0%" id="bar-route"></div>
                    </div>
                    <div class="text-xxs text-muted mt-1">${d.hits} hits / ${d.total} samples</div>
                </div>
                <div>
                    <div class="row-between">
                        <span class="settings-sub-label">End-Stop Precision</span>
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
            container.innerHTML = '<div class="text-xs text-danger text-center p-2">Probe failed.</div>';
        }
    }
};
