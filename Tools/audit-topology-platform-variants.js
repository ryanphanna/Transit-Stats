#!/usr/bin/env node

/**
 * Audit topology aliases that look like physical platform variants but are not
 * represented in `directional_stops`.
 */

const topology = require('../functions/lib/topology.json');

const PLATFORM_PATTERN = /\b(?:north|south|east|west|near|far)\s+side\b/i;

function normalized(name) {
  return name.trim().toLowerCase()
    .replace(/\s*[/&@]\s*/g, '/')
    .replace(/\s+at\s+/g, '/');
}

function variantLabels(variants) {
  return new Set((variants || []).flatMap(variant => [
    variant.name,
    ...(variant.aliases || []),
  ]).filter(Boolean).map(normalized));
}

function audit(topologyData = topology) {
  const findings = [];
  for (const [route, line] of Object.entries(topologyData.lines || {})) {
    for (const [canon, aliases] of Object.entries(line.aliases || {})) {
      const platformAliases = aliases.filter(alias => PLATFORM_PATTERN.test(alias));
      if (platformAliases.length === 0) continue;

      const variants = line.directional_stops?.[canon] || [];
      const labels = variantLabels(variants);
      const missingAliases = platformAliases.filter(alias => !labels.has(normalized(alias)));
      if (missingAliases.length === 0) continue;

      findings.push({
        route,
        stop: canon,
        aliases: missingAliases,
        hasDirectionalStops: variants.length > 0,
      });
    }
  }
  return findings;
}

function main() {
  const findings = audit();
  const strict = process.argv.includes('--strict');
  if (findings.length === 0) {
    console.log('No collapsed platform-variant aliases found.');
    return;
  }

  console.log(`Found ${findings.length} collapsed platform-variant alias group(s):`);
  for (const finding of findings) {
    console.log(`\n${finding.route} · ${finding.stop}`);
    console.log(`  directional_stops: ${finding.hasDirectionalStops ? 'partial' : 'missing'}`);
    for (const alias of finding.aliases) {
      console.log(`  - ${alias}`);
    }
  }
  if (strict) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { audit };
