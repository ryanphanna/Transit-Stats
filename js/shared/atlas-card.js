export const ATLAS_COPY = Object.freeze({
    recentHeading: 'Recent activity',
    totalRides: 'total rides',
    weekLabel: 'Last 7<br>days',
    monthLabel: 'Last 30<br>days',
    daysLabel: 'Days ridden',
    agenciesLabel: 'Agencies',
    countriesLabel: 'Countries',
});

export function formatAtlasNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
        ? value.toLocaleString('en-US')
        : value;
}

const atlasFacts = [
    ['week', 'stat-trips-week', ATLAS_COPY.weekLabel],
    ['month', 'stat-trips-month', ATLAS_COPY.monthLabel],
    ['days', 'stat-days-ridden', ATLAS_COPY.daysLabel],
    ['agencies', 'stat-agencies-ridden', ATLAS_COPY.agenciesLabel],
    ['countries', 'stat-countries-ridden', ATLAS_COPY.countriesLabel],
];

export function renderAtlasCard({ publicProfile = false } = {}) {
    const container = document.querySelector('[data-atlas-card]');
    if (!container) return null;

    const action = publicProfile
        ? '<a class="atlas-card-cta" href="/">Make your own map <span aria-hidden="true">→</span></a>'
        : '<button id="atlas-share-map" class="atlas-card-cta" type="button">Share your map <span aria-hidden="true">→</span></button>';

    container.innerHTML = `
        <h1><span id="profile-name">Traveler</span><span class="atlas-title-tail">’s</span><span class="atlas-title-product">TransitStats</span></h1>
        <p id="profile-status" class="atlas-profile-status" hidden></p>
        <div class="atlas-hero-count">
            <strong id="stat-trips-lifetime">0</strong>
            <span>${ATLAS_COPY.totalRides}</span>
        </div>
        <div class="atlas-card-period" aria-label="Recent trip totals">
            <div class="atlas-period-heading"><span>${ATLAS_COPY.recentHeading}</span></div>
            <div class="atlas-period-grid">
                ${atlasFacts.map(([name, id, label]) => `
                    <div class="atlas-fact atlas-fact-${name}"><strong id="${id}">0</strong><span>${label}</span></div>
                `).join('')}
            </div>
        </div>
        ${action}
    `;

    return container;
}

export function setAtlasDisplayName(displayName) {
    const name = String(displayName || '').trim() || 'Traveler';
    const profileName = document.getElementById('profile-name');
    if (profileName) profileName.textContent = name;

    const titleTail = document.querySelector('.atlas-title-tail');
    if (titleTail) titleTail.textContent = /s$/i.test(name) ? '’' : '’s';
}
