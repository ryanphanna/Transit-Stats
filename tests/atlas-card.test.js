// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ATLAS_COPY,
    formatAtlasNumber,
    getAtlasPageTitle,
    renderAtlasCard,
    setAtlasDisplayName,
} from '../js/shared/atlas-card.js';

const root = path.resolve(process.cwd());
const dashboardHtml = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const publicHtml = fs.readFileSync(path.join(root, 'public.html'), 'utf8');
const mainCss = fs.readFileSync(path.join(root, 'styles/main.css'), 'utf8');
const publicJs = fs.readFileSync(path.join(root, 'js/public.js'), 'utf8');
const dashboardAtlasCss = fs.readFileSync(path.join(root, 'styles/pages/dashboard-atlas.css'), 'utf8');

describe('shared Atlas card', () => {
    it('keeps both pages on the shared card renderer', () => {
        expect(dashboardHtml).toContain('data-atlas-card');
        expect(publicHtml).toContain('data-atlas-card');
        expect(dashboardHtml).not.toContain('Recent movement');
        expect(publicHtml).not.toContain('Recent movement');
    });

    it('uses one set of labels for dashboard and public cards', () => {
        document.body.innerHTML = '<div data-atlas-card></div>';
        const dashboardCard = renderAtlasCard();
        const dashboardMarkup = dashboardCard.innerHTML;
        renderAtlasCard({ publicProfile: true });
        const publicCard = document.querySelector('[data-atlas-card]');

        expect(dashboardCard.textContent).toContain(ATLAS_COPY.recentHeading);
        expect(publicCard.textContent).toContain(ATLAS_COPY.recentHeading);
        expect(publicCard.querySelector('#atlas-share-map')).toBeNull();
        expect(publicCard.querySelector('.atlas-card-cta')?.textContent).toContain('Make your own map');
        expect(dashboardMarkup).toContain('Share your map');
    });

    it('keeps the public error card hidden until a profile error occurs', () => {
        expect(publicHtml).toContain('class="public-error" id="public-error" hidden');
        expect(mainCss).toContain('.public-error[hidden]');
    });

    it('keeps the public mobile card compact enough to leave the map visible', () => {
        expect(dashboardAtlasCss).toContain('max-height: 52dvh');
        expect(dashboardAtlasCss).toContain('.atlas-card-period');
        expect(dashboardAtlasCss).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
        expect(dashboardAtlasCss).toContain('overflow: hidden');
    });

    it('initializes the public page logo icon', () => {
        expect(publicHtml).toContain('data-lucide="zap"');
        expect(publicJs).toContain("import { refreshIcons } from './shared/icons.js';");
        expect(publicJs).toContain('refreshIcons();');
    });

    it('keeps the public card visible with neutral placeholders while profile data loads', () => {
        document.body.innerHTML = '<div data-atlas-card></div>';
        const card = renderAtlasCard({ publicProfile: true, loading: true });
        expect(card.classList.contains('is-loading')).toBe(true);
        expect(card.getAttribute('aria-busy')).toBe('true');
        expect(card.querySelector('#profile-name').textContent).toBe('');
        expect(dashboardAtlasCss).toContain('.atlas-identity-card.is-loading h1::after');
    });

    it('handles possessive names consistently', () => {
        document.body.innerHTML = '<div data-atlas-card></div>';
        renderAtlasCard();

        setAtlasDisplayName('TransitStats');
        expect(document.querySelector('#profile-name').textContent).toBe('TransitStats');
        expect(document.querySelector('.atlas-title-tail').textContent).toBe('’');

        setAtlasDisplayName('Ryan');
        expect(document.querySelector('.atlas-title-tail').textContent).toBe('’s');
    });

    it('uses the profile name in the public page title', () => {
        expect(getAtlasPageTitle('Ryan')).toBe('Ryan’s TransitStats');
        expect(getAtlasPageTitle('James')).toBe('James’ TransitStats');
        expect(getAtlasPageTitle('')).toBe('Traveler’s TransitStats');
    });

    it('formats large dashboard and public totals with separators', () => {
        expect(formatAtlasNumber(2767)).toBe('2,767');
        expect(formatAtlasNumber(0)).toBe('0');
    });
});
