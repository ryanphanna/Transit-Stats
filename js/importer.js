
/**
 * TransitStats Importer Module
 * Handles local-first storage and parsing for external transit reports
 */
import { UI } from './ui-utils.js';

export const Importer = {
    LOCAL_STORAGE_KEY: 'transitstats_local_taps',

    /**
     * PrestoProvider - Specifically for parsing PRESTO CSV exports
     */
    PrestoProvider: {
        id: 'presto',
        name: 'PRESTO',

        parse: function (csvText) {
            const lines = csvText.split('\n');
            if (lines.length < 2) return [];

            const headers = lines[0].split(',');
            const dateIdx = headers.indexOf('Date');
            const agencyIdx = headers.indexOf('Transit Agency');
            const locationIdx = headers.indexOf('Location');
            const typeIdx = headers.indexOf('Type');

            if (dateIdx === -1 || locationIdx === -1) {
                throw new Error('Invalid PRESTO CSV format. Missing Date or Location headers.');
            }

            const taps = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;

                // Simple CSV split (handling quotes if necessary, though PRESTO usually is clean)
                const parts = lines[i].split(',');
                if (parts.length < Math.max(dateIdx, locationIdx, typeIdx)) continue;

                const type = parts[typeIdx]?.trim() || '';
                // Only import fare payments/transfers, ignore loads for the map
                if (type !== 'Fare Payment' && type !== 'Transfer' && type !== 'Discount') continue;

                taps.push({
                    date: parts[dateIdx].trim(),
                    agency: parts[agencyIdx]?.trim() || 'Other',
                    location: parts[locationIdx]?.trim() || 'Unknown',
                    source: 'presto',
                    id: `local_presto_${i}_${Date.now()}` // Temporary unique ID
                });
            }
            return taps;
        }
    },

    /**
     * Save taps to LocalStorage
     */
    saveLocalTaps: function (newTaps) {
        try {
            const existing = this.getLocalTaps();
            const combined = [...existing, ...newTaps];

            // Deduplicate by simple string comparison of date + location
            const unique = [];
            const seen = new Set();
            combined.forEach(tap => {
                const key = `${tap.date}|${tap.location}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(tap);
                }
            });

            localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(unique));
            console.log(`💾 Saved ${unique.length} taps to local storage.`);
            return unique.length;
        } catch (error) {
            console.error('Error saving local taps:', error);
            UI.showNotification('Failed to save data to device.', 'error');
            return 0;
        }
    },

    /**
     * Get taps from LocalStorage
     */
    getLocalTaps: function () {
        try {
            const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error reading local taps:', error);
            return [];
        }
    },

    /**
     * Clear all local storage data
     */
    clearLocalData: function () {
        if (confirm('Are you sure you want to clear all imported local data? This will not affect your cloud trips.')) {
            localStorage.removeItem(this.LOCAL_STORAGE_KEY);
            UI.showNotification('Local data cleared.', 'success');
            if (window.Visuals && window.fullMap) {
                // Trigger map refresh if needed
            }
            return true;
        }
        return false;
    },

    /**
     * Process a file upload
     */
    handleFileUpload: async function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const taps = this.PrestoProvider.parse(text);
                    const count = this.saveLocalTaps(taps);
                    resolve({ count, total: taps.length });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsText(file);
        });
    }
};

window.Importer = Importer;
