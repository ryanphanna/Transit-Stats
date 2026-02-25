# TransitStats Senior Developer Improvement Plan

This plan outlines the steps to modernize the TransitStats codebase, improving its maintainability, performance, and scalability. We will tackle these in logical blocks to ensure the app remains functional throughout the process.

## Phase 1: Foundation & De-cluttering (LOW RISK)
*Goal: Consolidate configuration and reduce the size of the "God File" (`app.js`).*

- [ ] **1.1: Centralize Firebase Config**
    - Remove hardcoded `firebaseConfig` objects from `app.js` and `admin.js`.
    - Ensure `firebase-config.js` is the single source of truth.
- [ ] **1.2: Move Logic out of `app.js`**
    - Move "Active Trip" logic (starting/ending/banners) to `js/trips.js`.
    - Move "Edit Trip" logic to `js/trips.js`.
    - Move "Auth Switcher" and "Section Navigation" logic to `js/ui-manager.js`.
- [ ] **1.3: Clean up `index.html`**
    - Remove remaining inline `onclick` handlers and move them to `js/main.js` event listeners.

## Phase 2: Modernization (MEDIUM RISK)
*Goal: Shift from Global Namespaces to ES Modules.*

- [ ] **2.1: Enable ES Modules**
    - Update `<script>` tags in `index.html` to `type="module"`.
- [ ] **2.2: Convert to Imports/Exports**
    - Replace `window.ui = ...` with `export const ui = ...`.
    - Use `import` statements at the top of files.
    - This will fix long-term dependency order issues.

## Phase 3: Firebase SDK Migration (MEDIUM RISK)
*Goal: Upgrade to the Modular Firebase v9+ SDK for better performance.*

- [ ] **3.1: Switch from Compat to Modular**
    - Update `firebase-config.js` to use the new initialization pattern.
    - Refactor `db.collection()` calls to `collection(db, ...)` syntax.
    - Benefit: Smaller bundle size and faster load times.

## Phase 4: Professional Tooling & CSS (OPTIONAL/LONG-TERM)
*Goal: Prepare the app for enterprise-grade deployment.*

- [ ] **4.1: Introduce Vite**
    - Initialize Vite for bundling and minification.
    - Move configuration into a `.env` file.
- [ ] **4.2: Modular CSS**
    - Split the 1,700-line `styles.css` into specific theme, layout, and component files.
- [ ] **4.3: Standardized UI Rendering**
    - Create a consistent pattern for updating the DOM instead of ad-hoc `textContent` assignments.
