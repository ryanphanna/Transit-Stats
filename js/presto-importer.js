import firebase, { db } from './firebase.js';

const AGENCY_ALIASES = new Map([
    ['Toronto Transit Commission', 'TTC'],
    ['GO Transit', 'GO'],
    ['Mississauga Transit', 'MiWay'],
    ['Hamilton Street Railway', 'HSR'],
    ['York Region Transit', 'YRT'],
]);

const LOCATION_ALIASES = new Map([
    ['Toronto- New USBT', 'Union Station Bus Terminal'],
]);

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ',') {
            row.push(field);
            field = '';
        } else if (character === '\n') {
            row.push(field.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }

    if (field || row.length > 0) {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
    }

    const [headers, ...values] = rows;
    if (!headers?.includes('Date') || !headers.includes('Type')) {
        throw new Error('This does not look like a PRESTO Transit Usage Report.');
    }
    return values
        .filter(value => value.length === headers.length && value.some(Boolean))
        .map(value => Object.fromEntries(headers.map((header, index) => [header, value[index]])));
}

function parseAmountCents(value) {
    const amount = Number(String(value || '').replace(/[$,]/g, ''));
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function parseDate(value) {
    const match = String(value || '').match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i,
    );
    if (!match) return null;
    let hour = Number(match[4]);
    if (match[7].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (match[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
    return {
        local: value,
        sortKey: Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), hour, Number(match[5]), Number(match[6])),
    };
}

function classifyType(value) {
    if (value === 'Fare Payment') return 'fare_payment';
    if (value === 'Period Pass Load') return 'period_pass_load';
    if (value === 'Epurse Load') return 'epurse_load';
    return 'unknown';
}

function toRecord(row, rowNumber, fileName) {
    const date = parseDate(row.Date);
    const rawLocation = row.Location || null;
    return {
        source: 'presto',
        sourceFileName: fileName,
        sourceRowNumber: rowNumber,
        occurredAtLocal: row.Date || null,
        occurredAtSortKey: date?.sortKey || null,
        agency: AGENCY_ALIASES.get(row.TransitAgency) || row.TransitAgency || null,
        agencySource: row.TransitAgency || null,
        type: classifyType(row.Type),
        amountCents: parseAmountCents(row.Amount),
        location: rawLocation,
        locationLabel: LOCATION_ALIASES.get(rawLocation) || rawLocation,
        locationAliasApplied: LOCATION_ALIASES.has(rawLocation),
        raw: row,
    };
}

async function fingerprint(record) {
    const input = JSON.stringify([
        record.occurredAtLocal,
        record.agencySource,
        record.location,
        record.type,
        record.amountCents,
    ]);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function summarize(records) {
    const farePayments = records.filter(record => record.type === 'fare_payment');
    const loads = records.filter(record => record.type !== 'fare_payment');
    const dates = records
        .filter(record => Number.isFinite(record.occurredAtSortKey))
        .sort((left, right) => left.occurredAtSortKey - right.occurredAtSortKey);
    const agencies = {};
    records.forEach(record => {
        if (record.agency) agencies[record.agency] = (agencies[record.agency] || 0) + 1;
    });
    return {
        rows: records.length,
        farePayments: farePayments.length,
        loads: loads.length,
        fareChargedCents: -farePayments.reduce((total, record) => total + (record.amountCents || 0), 0),
        loadedCents: loads.reduce((total, record) => total + (record.amountCents || 0), 0),
        first: dates[0]?.occurredAtLocal || null,
        last: dates.at(-1)?.occurredAtLocal || null,
        agencies,
        invalidRows: records.filter(record => !Number.isFinite(record.occurredAtSortKey) || record.amountCents === null).length,
    };
}

function money(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

function show(element, visible) {
    element?.classList.toggle('hidden', !visible);
}

function status(element, message, type = '') {
    if (!element) return;
    element.textContent = message;
    element.className = `settings-row presto-import-status ${type}`;
    show(element, true);
}

export function initPrestoImporter({ user }) {
    const group = document.getElementById('presto-import-group');
    const input = document.getElementById('presto-file-input');
    const previewButton = document.getElementById('presto-preview-button');
    const preview = document.getElementById('presto-import-preview');
    const actions = document.getElementById('presto-import-actions');
    const importButton = document.getElementById('presto-import-button');
    const statusElement = document.getElementById('presto-import-status');
    if (!group || !input || !previewButton || !preview || !actions || !importButton || !statusElement) return;

    show(group, true);
    let pendingRecords = [];

    input.addEventListener('change', () => {
        pendingRecords = [];
        show(preview, false);
        show(actions, false);
        show(statusElement, false);
        previewButton.disabled = input.files.length === 0;
    });

    previewButton.addEventListener('click', async () => {
        previewButton.disabled = true;
        try {
            const files = [...input.files];
            const recordsByFile = await Promise.all(files.map(async file => {
                const rows = parseCsv(await file.text());
                return rows.map((row, index) => toRecord(row, index + 2, file.name));
            }));
            pendingRecords = recordsByFile.flat();
            const summary = summarize(pendingRecords);
            const agencySummary = Object.entries(summary.agencies)
                .map(([agency, count]) => `${agency} (${count})`)
                .join(', ');
            preview.textContent = [
                `${summary.rows} rows ready`,
                `${summary.farePayments} fare payments · ${summary.loads} loads`,
                `${money(summary.fareChargedCents)} charged · ${money(summary.loadedCents)} loaded`,
                `${summary.first || 'Unknown'} to ${summary.last || 'unknown'}`,
                `Agencies: ${agencySummary || 'none'}`,
                summary.invalidRows ? `${summary.invalidRows} rows need review and will not be imported.` : 'All rows passed basic validation.',
            ].join('\n');
            show(preview, true);
            show(actions, summary.invalidRows === 0 && pendingRecords.length > 0);
            status(statusElement, 'Preview only. Nothing has been saved.', 'success');
        } catch (error) {
            pendingRecords = [];
            status(statusElement, error.message || 'Could not read this PRESTO report.');
        } finally {
            previewButton.disabled = input.files.length === 0;
        }
    });

    importButton.addEventListener('click', async () => {
        if (!pendingRecords.length || importButton.disabled) return;
        importButton.disabled = true;
        try {
            const records = await Promise.all(pendingRecords.map(async record => ({
                ...record,
                fingerprint: await fingerprint(record),
                userId: user.uid,
                importedAt: firebase.firestore.FieldValue.serverTimestamp(),
            })));
            const batchCount = Math.ceil(records.length / 400);
            for (let start = 0; start < records.length; start += 400) {
                const batchNumber = Math.floor(start / 400) + 1;
                status(statusElement, `Importing batch ${batchNumber} of ${batchCount}…`);
                const batch = db.batch();
                records.slice(start, start + 400).forEach(record => {
                    const ref = db.collection('prestoTransactions').doc(record.fingerprint);
                    batch.set(ref, record, { merge: true });
                });
                await batch.commit();
            }
            const imported = await db.collection('prestoTransactions').where('userId', '==', user.uid).get();
            status(statusElement, `${records.length} rows processed; ${imported.size} unique PRESTO records now stored. Re-imports will not create duplicates.`, 'success');
            show(actions, false);
        } catch (error) {
            status(statusElement, error.message || 'Could not import PRESTO activity.');
        } finally {
            importButton.disabled = false;
        }
    });
}

export { classifyType, parseAmountCents, parseCsv, parseDate, summarize, toRecord };
