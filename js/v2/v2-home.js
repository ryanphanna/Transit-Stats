import { auth, db } from '../firebase.js';

/**
 * TransitStats V2 — Homepage (Gateway) Logic
 * Handles the unified phone-number login/sign-up flow.
 */
const V2Home = {
    init() {
        const input = document.getElementById('v2-phone-input');
        const btn = document.getElementById('v2-btn-go');
        
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleGateway();
        });

        btn?.addEventListener('click', () => this.handleGateway());

        this.checkExistingAuth();

        if (window.lucide) lucide.createIcons();
    },

    /**
     * If already logged in, swap the UI immediately.
     */
    checkExistingAuth() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Find their phone number to show a personalized welcome
                const phoneSnap = await db.collection('phoneNumbers')
                    .where('userId', '==', user.uid)
                    .limit(1)
                    .get();

                const phoneLabel = !phoneSnap.empty ? phoneSnap.docs[0].id : user.email;
                this.showSuccessState(`Welcome back!`, `Signed in as ${phoneLabel}`, user.uid);
            }
        });
    },

    async handleGateway() {
        const input = document.getElementById('v2-phone-input');
        let phone = input.value.trim().replace(/\D/g, ''); 

        if (!phone || phone.length < 10) {
            this.showStatus("Please enter a valid phone number.", "error");
            return;
        }

        if (phone.length === 10) phone = '1' + phone;
        const e164 = '+' + phone;

        this.showStatus("Verifying...", "info");

        try {
            const phoneDoc = await db.collection('phoneNumbers').doc(e164).get();

            if (phoneDoc.exists) {
                const data = phoneDoc.data();
                const userId = data.userId;
                
                if (userId) {
                    this.showSuccessState("Welcome back!", "Opening your map...", userId);
                } else {
                    this.showStatus("Profile found but missing ID. Try Legacy Dashboard.", "error");
                }
            } else {
                // Not signed up yet
                this.showStatus("Intro text sent! Check your messages to start tracking.", "success");
            }
        } catch (err) {
            console.error("Gateway error:", err);
            this.showStatus("Connection error. Please try again.", "error");
        }
    },

    /**
     * Hides the login UI and shows the success/loading state
     */
    showSuccessState(title, msg, userId) {
        const gateway = document.getElementById('v2-gateway-container');
        const success = document.getElementById('v2-success-container');
        const status = document.getElementById('v2-auth-status');

        if (gateway) gateway.classList.add('hidden');
        if (status) status.classList.add('hidden');
        
        if (success) {
            document.getElementById('v2-success-title').textContent = title;
            document.getElementById('v2-success-msg').textContent = msg;
            success.classList.remove('hidden');
        }

        // Redirect after a brief moment to show the success state
        if (userId) {
            setTimeout(() => {
                window.location.href = `/v2?u=${userId}`;
            }, 1200);
        }
    },

    showStatus(msg, type) {
        const el = document.getElementById('v2-auth-status');
        if (!el) return;
        el.textContent = msg;
        el.className = `v2-status-msg ${type}`;
        el.classList.remove('hidden');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => V2Home.init());
} else {
    V2Home.init();
}
