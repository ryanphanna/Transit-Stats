import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supplementsPath = path.join(projectRoot, 'js', 'stop-supplements.json');
const supplements = JSON.parse(fs.readFileSync(supplementsPath, 'utf8'));

assert.deepEqual(Object.keys(supplements).sort(), ['local', 'oldTrips']);

let totalStops = 0;
for (const [group, agencies] of Object.entries(supplements)) {
    assert.equal(typeof agencies, 'object', `${group} must be an object`);
    const agencyStopKeys = new Set();

    for (const [agency, stops] of Object.entries(agencies)) {
        assert.ok(agency.trim(), `${group} contains an empty agency name`);
        assert.ok(Array.isArray(stops), `${group}/${agency} must be an array`);

        for (const stop of stops) {
            assert.ok(stop.code === undefined || (typeof stop.code === 'string' && stop.code.trim()),
                `${group}/${agency} has an invalid code`);
            assert.equal(typeof stop.name, 'string', `${group}/${agency} has a non-string name`);
            assert.ok(stop.name.trim(), `${group}/${agency} has an empty name`);
            assert.equal(typeof stop.lat, 'number', `${group}/${agency}/${stop.code} has an invalid latitude`);
            assert.equal(typeof stop.lng, 'number', `${group}/${agency}/${stop.code} has an invalid longitude`);
            assert.ok(stop.lat >= -90 && stop.lat <= 90, `${group}/${agency}/${stop.code} latitude is out of range`);
            assert.ok(stop.lng >= -180 && stop.lng <= 180, `${group}/${agency}/${stop.code} longitude is out of range`);
            assert.ok(stop.aliases === undefined || Array.isArray(stop.aliases),
                `${group}/${agency}/${stop.code || stop.name} aliases must be an array`);
            assert.ok((stop.aliases || []).every(alias => typeof alias === 'string' && alias.trim()),
                `${group}/${agency}/${stop.code || stop.name} contains an invalid alias`);

            const identity = stop.code || `${stop.name}\u0000${stop.lat}\u0000${stop.lng}`;
            const key = `${agency}\u0000${identity}`;
            assert.ok(!agencyStopKeys.has(key), `${group} contains duplicate ${agency}/${identity}`);
            agencyStopKeys.add(key);
            totalStops += 1;
        }
    }
}

console.log(`Validated ${totalStops} normalized stop supplements.`);
