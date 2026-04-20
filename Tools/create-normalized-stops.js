/**
 * create-normalized-stops.js
 *
 * Creates all stops researched in the 2026-04-19 normalization session.
 * Idempotent — if a stop with the same code + agency already exists, it is
 * skipped. If it exists by name only (no code), aliases are merged in.
 *
 * Usage:
 *   node Tools/create-normalized-stops.js [--dry-run]
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

const STOPS = [
  // ── Spadina line (510) ─────────────────────────────────────────────────
  { name: 'Spadina / King', code: '7353', agency: 'TTC', aliases: ['Spadina / King', 'Spadina/King', 'Spadina/king', '13161 Spadina / King'] },
  { name: 'Spadina / King', code: '8126', agency: 'TTC', aliases: [] },
  { name: 'Spadina / Richmond', code: '11985', agency: 'TTC', aliases: ['Spadina / Richmond', 'Spadina & Richmond St W', 'Spadina / Richmond St W', 'Spadina/richmond'] },
  { name: 'Spadina / Harbord', code: '7351', agency: 'TTC', aliases: [] },
  { name: 'Spadina / Harbord', code: '8124', agency: 'TTC', aliases: ['Spadina/harbord', 'Harbord / Spadina', '8124 Spadina and Harbord'] },
  { name: 'Spadina / Queen', code: '7355', agency: 'TTC', aliases: ['Spadina and Queen 7355'] },
  { name: 'Spadina / Queen', code: '8129', agency: 'TTC', aliases: ['Spadina / Queen St W', 'Spadina & Queen', 'Spadina / Queen'] },
  { name: 'Nassau / Spadina', code: '11986', agency: 'TTC', aliases: ['Nassau / Spadina', 'Nassau/Spadina', 'SPADINA & NASSAU 11986', 'Nassau and Spadina 11986', '11986 Spadina & Nassau'] },
  { name: 'Nassau / Spadina', code: '8128', agency: 'TTC', aliases: ['Spadina and Nassau'] },
  { name: 'Nassau & Sullivan', code: '8131', agency: 'TTC', aliases: ['Nassau & Sullivan', 'Spadina / Sullivan'] },
  { name: 'Spadina / Dundas', code: '7349', agency: 'TTC', aliases: ['Spadina / Dundas', 'Spadina/Dundas'] },
  { name: 'Spadina / Dundas', code: '8121', agency: 'TTC', aliases: ['Spadina / Dundas St W S'] },
  { name: 'Spadina / College', code: '7347', agency: 'TTC', aliases: ['Spadina / College'] },
  { name: 'Spadina / College', code: '8120', agency: 'TTC', aliases: ['SPADINA / COLLEGE SOUTH'] },
  { name: 'Spadina / Bremner', code: '10777', agency: 'TTC', aliases: ['Spadina / Bremner', 'Bremner N / Spadina'] },
  { name: 'Spadina / Bremner', code: '10929', agency: 'TTC', aliases: [] },
  { name: 'Spadina / Front St W', code: '7346', agency: 'TTC', aliases: ['7346 Spadina Avenue and Front St., West', 'Spadina / Front St W'] },
  { name: 'Spadina / Queens Quay West', code: '12085', agency: 'TTC', aliases: ['Spadina / Queens Quay West North'] },

  // ── King line (504) ────────────────────────────────────────────────────
  { name: 'Spadina / King', code: '15648', agency: 'TTC', aliases: [] },
  { name: 'Spadina / King', code: '15647', agency: 'TTC', aliases: [] },
  { name: 'King / Church', code: '12537', agency: 'TTC', aliases: ['King / Church', 'King/Church'] },

  // ── Dundas line (505) ──────────────────────────────────────────────────
  { name: 'Spadina / Dundas', code: '2189', agency: 'TTC', aliases: ['Spadina & Dundas St West'] },
  { name: 'Spadina / Dundas', code: '2190', agency: 'TTC', aliases: ['Spadina and Dundas W'] },
  { name: 'Dundas / Jarvis', code: '2118', agency: 'TTC', aliases: ['Dundas / Jarvis', 'Dundas/Jarvis'] },
  { name: 'Dundas / Sterling', code: '991', agency: 'TTC', aliases: ['Dundas / Sterling', 'Dundas/Sterling', 'Dundas/Sterlingp'] },
  { name: 'Dundas / Beverley', code: '2146', agency: 'TTC', aliases: ['Dundas W/Beverely St', 'Dundas / Beverley'] },
  { name: 'Dundas / Dupont', code: '3493', agency: 'TTC', aliases: ['Dundas / Dupont', 'Dundas/Dupont'] },

  // ── Carlton line (506) ─────────────────────────────────────────────────
  { name: 'Carlton / Church', code: '751', agency: 'TTC', aliases: ['CARLTON & CHURCH', 'Church/carlton'] },
  { name: 'Carlton / Church', code: '752', agency: 'TTC', aliases: ['Carlton / Church', 'Church / Carlton'] },
  { name: 'Dufferin / College', code: '826', agency: 'TTC', aliases: ['826 College & Dufferin', 'Dufferin / College', 'College / Dufferin'] },
  { name: 'Dufferin / College', code: '827', agency: 'TTC', aliases: [] },
  { name: 'Spadina / College', code: '843', agency: 'TTC', aliases: [] },
  { name: 'Spadina / College', code: '844', agency: 'TTC', aliases: ['COLLEGE & SPADINA', 'College &spadina'] },
  { name: 'Gerrard / Pape', code: '1100', agency: 'TTC', aliases: ['Gerrard / Pape'] },
  { name: 'Gerrard / Pape', code: '1101', agency: 'TTC', aliases: ['Gerrard/Pape', '1101 Gerrard St E / Pape'] },
  { name: 'Gerrard / Jones', code: '1092', agency: 'TTC', aliases: ['Gerrard/Jones'] },
  { name: 'Gerrard / Jones', code: '1093', agency: 'TTC', aliases: ['Gerrard/Jones'] },
  { name: 'Carlton / Jarvis', code: '753', agency: 'TTC', aliases: ['Carlton / Jarvis'] },
  { name: 'College / Beverley', code: '815', agency: 'TTC', aliases: ['College & Beverley', 'College / Beverly', 'College / Beverley'] },
  { name: 'College / Euclid', code: '831', agency: 'TTC', aliases: ['College / Euclid'] },
  { name: 'College / Major', code: '12338', agency: 'TTC', aliases: ['College / Augusta', 'College / Major'] },
  { name: 'College / Brock', code: '819', agency: 'TTC', aliases: ['College / Brock'] },
  { name: 'College / Lansdowne', code: '835', agency: 'TTC', aliases: ['College / Lansdowne'] },
  { name: "Queen's Park", code: '847', agency: 'TTC', aliases: ["QUEEN'S park 847", "Queen's Park"] },
  { name: 'College Station', code: '760', agency: 'TTC', aliases: ['College 760', 'Carlton / Yonge'] },

  // ── Dufferin line (29/929) ─────────────────────────────────────────────
  { name: 'Dufferin / College', code: '2034', agency: 'TTC', aliases: ['Dufferin&college', 'Dufferin/College 2034'] },
  { name: 'Dufferin / College', code: '2033', agency: 'TTC', aliases: [] },
  { name: 'Dufferin / Apex Rd', code: '2016', agency: 'TTC', aliases: ['Dufferin / Apex Rd S', 'Dufferin / Apex Rd'] },
  { name: 'Dufferin / Lawrence', code: '2070', agency: 'TTC', aliases: ['Dufferin/lawrence', 'Dufferin / Lawrence'] },
  { name: 'Dufferin Gate Loop', code: '2032', agency: 'TTC', aliases: ['Dufferin / Dufferin Gate', 'Dufferin Gate Loop'] },

  // ── Harbord/Wellesley line (94) ────────────────────────────────────────
  { name: 'Spadina / Harbord', code: '7817', agency: 'TTC', aliases: ['Spadina / Harbord', 'Harbord / Spadina'] },
  { name: 'Spadina / Harbord', code: '7818', agency: 'TTC', aliases: [] },

  // ── Bathurst line (511) ────────────────────────────────────────────────
  { name: 'Bathurst / Nassau', code: '178', agency: 'TTC', aliases: ['Bathurst / Nassau'] },
  { name: 'Bathurst / Nassau', code: '16454', agency: 'TTC', aliases: [] },
  { name: 'Bathurst / King', code: '162', agency: 'TTC', aliases: ['Bathurst / King'] },
  { name: 'Bathurst / King', code: '161', agency: 'TTC', aliases: [] },
  { name: 'Bathurst / Fort York', code: '100', agency: 'TTC', aliases: ['Bathurst / Fort York'] },
  { name: 'Bathurst / Queen W', code: '186', agency: 'TTC', aliases: ['Bathurst/Queen W', 'Bathurst / Queen W'] },
  { name: 'Bathurst / College', code: '110', agency: 'TTC', aliases: ['Bathurst/College', 'Bathurst / College'] },
  { name: 'Exhibition Loop', code: '12584', agency: 'TTC', aliases: ['Exhibition Loop'] },

  // ── Lawrence West line (52) ────────────────────────────────────────────
  { name: 'Lawrence Av W / Pimlico Rd', code: '5394', agency: 'TTC', aliases: ['5394 Lawrence Av W / Pimilco Road', '5394 Lawrence Av W / Pimloco Rd', 'Lawrence Av W / Pimlico Rd'] },
  { name: 'Lawrence Av W / Pimlico Rd', code: '5393', agency: 'TTC', aliases: ['LAWRENCE AV W / Pimlico Rd W', 'Lawrence / Pimilco', 'Lawrence / Pilimco', 'Lawrence Av W / Pimlico', 'Lawrence Av West / Pimlico Rd W'] },
  { name: 'Lawrence Av W / Duval Dr', code: '5366', agency: 'TTC', aliases: ['LAWRENCE AV W & Duval Dr', 'Lawrence Av W / Duval Dr', 'Lawrence Av W / Duval Dr 5366', 'Lawrence Av / Duval', '5366 Lawrence / Duval', '5366 Lawrence Av W / Duval Dr'] },
  { name: 'Lawrence Av W / Duval Dr', code: '5367', agency: 'TTC', aliases: [] },
  { name: 'Lawrence / Kennedy', code: '4096', agency: 'TTC', aliases: ['Lawrence / Kennedy', 'Kennedy / Lawrence'] },

  // ── Parliament line (65) ───────────────────────────────────────────────
  { name: 'Parliament / Gerrard', code: '6650', agency: 'TTC', aliases: ['Parliament / Gerrard', 'Parliament & Gerrard'] },
  { name: 'Parliament / Mill', code: '5996', agency: 'TTC', aliases: ['Parliament / Mill'] },

  // ── Lansdowne line (47) ────────────────────────────────────────────────
  { name: 'Lansdowne / Dupont', code: '4401', agency: 'TTC', aliases: ['Lansdowne & Dupont'] },
  { name: 'Lansdowne / Dupont', code: '4402', agency: 'TTC', aliases: ['Lansdowne / Dupont'] },
  { name: 'College / Lansdowne', code: '5212', agency: 'TTC', aliases: ['College / Lansdowne'] },

  // ── Wilson line (96) ───────────────────────────────────────────────────
  { name: 'Wilson / Bathurst', code: '8840', agency: 'TTC', aliases: ['Wilson Av / Bathurst St W', 'Wilson / Bathurst'] },

  // ── Bathurst line (7) ──────────────────────────────────────────────────
  { name: 'Bathurst / Wilson', code: '223', agency: 'TTC', aliases: ['Bathurst / Wilson'] },

  // ── Queen line (501) ───────────────────────────────────────────────────
  { name: 'Ossington / Queen', code: '6847', agency: 'TTC', aliases: ['Ossington / Queen'] },
  { name: 'Queen / Dovercourt', code: '6831', agency: 'TTC', aliases: ['Queen / Dovercourt'] },
  { name: 'Queen / Dunn', code: '6835', agency: 'TTC', aliases: ['Queen / Dunn'] },

  // ── Kingston Rd line (503) ─────────────────────────────────────────────
  { name: 'King / Sherbourne', code: '4145', agency: 'TTC', aliases: ['King / Sherbourne'] },
  { name: 'Queen St E / Carlaw', code: '3035', agency: 'TTC', aliases: ['Queen St E / Carlaw Av'] },

  // ── Jones line (83) ────────────────────────────────────────────────────
  { name: 'Jones / Gerrard', code: '1188', agency: 'TTC', aliases: ['Jones/Gerrard', '1188 Jones & Gerrard', 'Jones / Gerrard'] },
  { name: 'Leslie / Commissioners', code: '1238', agency: 'TTC', aliases: ['Leslie/Commissioners', 'Leslie / Commissioners'] },

  // ── Pape line (72) ─────────────────────────────────────────────────────
  { name: 'Carlaw / Gerrard', code: '6289', agency: 'TTC', aliases: ['Carlaw/Gerrard', 'Carlaw / Gerrard'] },
  { name: 'Carlaw / Queen St E', code: '4858', agency: 'TTC', aliases: ['4858 Carlaw & Queen St E'] },

  // ── Davenport line (127) ───────────────────────────────────────────────
  { name: 'Davenport / Ossington', code: '950', agency: 'TTC', aliases: ['Davenport / Ossington'] },

  // ── Ossington line (63) ────────────────────────────────────────────────
  { name: 'Ossington / College', code: '5957', agency: 'TTC', aliases: ['Ossington / College'] },

  // ── Keele line (41) ────────────────────────────────────────────────────
  { name: 'Sentinel / The Pond', code: '7992', agency: 'TTC', aliases: ['Sentinel Road / The Pond Road South 7992', 'Sentinel / The Pond'] },
  { name: 'Keele / Broadoaks', code: '9148', agency: 'TTC', aliases: ['Keele / Broadoaks'] },
  { name: 'Keele / Lawrence', code: '9152', agency: 'TTC', aliases: ['Keele / Lawrence Av W', 'Keele / Lawrence'] },
  { name: 'St Clair W / Weston', code: '15750', agency: 'TTC', aliases: ['St Clair W / Weston'] },

  // ── Weston line (89) ───────────────────────────────────────────────────
  { name: 'Keele / St Clair W', code: '11689', agency: 'TTC', aliases: ['Keele / St Clair W'] },

  // ── Flemingdon Park line (100) ─────────────────────────────────────────
  { name: 'Broadview / Mortimer', code: '657', agency: 'TTC', aliases: ['Broadview Av / Mortimer Av N', 'Broadview / Mortimer'] },

  // ── Ancaster Park line (184) ───────────────────────────────────────────
  { name: 'Gilley / Garratt', code: '1130', agency: 'TTC', aliases: ['Gilley / Garratt', 'Gilley /garratt'] },

  // ── Pharmacy line (67) ─────────────────────────────────────────────────
  { name: 'Pharmacy / Eglinton', code: '6697', agency: 'TTC', aliases: ['6697 Pharmacy & Eglinton', 'Pharmacy / Eglinton'] },
  { name: 'Pharmacy / Lawrence', code: '6722', agency: 'TTC', aliases: ['Pharmacy / Lawrence'] },

  // ── Harbourfront line (509) ────────────────────────────────────────────
  { name: 'Fleet / Bastion', code: '14512', agency: 'TTC', aliases: ['Fleet / Bastion'] },
  { name: 'Fleet / Bathurst', code: '10210', agency: 'TTC', aliases: ['Fleet / Bathurst'] },
  { name: 'Queens Quay W / Lower Spadina', code: '13131', agency: 'TTC', aliases: ['Queens Quay W / Lower Spadina E', 'Queens Quay W / Lower Spadina Av East Side'] },
  { name: 'Queens Quay W / Dan Leckie Way', code: '13367', agency: 'TTC', aliases: ['Queens Quay W / Dan Leckie Way W'] },
  { name: 'Harbourfront Centre', code: '15332', agency: 'TTC', aliases: ['Harbourfront Centre'] },

  // ── Queens Quay / Ferry (114) ──────────────────────────────────────────
  { name: 'Queens Quay E / Lower Jarvis', code: '15129', agency: 'TTC', aliases: ['Lower Jarvis/Queens Quay E'] },
  { name: 'Jack Layton Ferry Terminal', code: '262', agency: 'TTC', aliases: ['Bay/Queens Quay/Ferry Docks', 'Jack Layton Ferry Terminal'] },

  // ── Airport Express (900) ──────────────────────────────────────────────
  { name: 'Terminal 3', code: '14278', agency: 'TTC', aliases: ['Terminal 3'] },

  // ── Airport-Humber (906) ───────────────────────────────────────────────
  { name: 'Viscount Station', code: '16760', agency: 'TTC', aliases: ['Viscount Station'] },
  { name: 'Humber College Terminal', code: '15406', agency: 'TTC', aliases: ['Humber College Terminal'] },

  // ── Highway 27 Express (927) ───────────────────────────────────────────
  { name: 'Humber College Blvd / Hwy 27', code: '11272', agency: 'TTC', aliases: ['Humber College Blvd / Hwy 27 W'] },

  // ── TTC subway stations (no code) ─────────────────────────────────────
  { name: 'Donlands', code: '', agency: 'TTC', aliases: ['Donlands'] },
  { name: 'Vaughan Metropolitan Centre', code: '', agency: 'TTC', aliases: ['VMC', 'Vmc', 'Vaughan Metropolitan Centre'] },
  { name: 'Richmond Hill Centre', code: '', agency: 'TTC', aliases: ['Richmond Hill Centre'] },
  { name: 'Keelesdale', code: '', agency: 'TTC', aliases: ['Keelsdale', 'Keelesdale'] },
  { name: 'Leaside', code: '', agency: 'TTC', aliases: ['Leaside'] },
  { name: 'Laird', code: '', agency: 'TTC', aliases: ['Laird'] },
  { name: 'Don Valley', code: '', agency: 'TTC', aliases: ['Don Valley'] },
  { name: 'Pharmacy', code: '', agency: 'TTC', aliases: ['Pharmacy'] },
  { name: 'Museum', code: '', agency: 'TTC', aliases: ['Museum'] },
  { name: 'Jane', code: '', agency: 'TTC', aliases: ['Jane'] },
  { name: 'Keele', code: '', agency: 'TTC', aliases: ['Keele'] },
  { name: 'Queens Quay', code: '', agency: 'TTC', aliases: ['Queens Quay'] },
  { name: 'Don Valley Station', code: '', agency: 'TTC', aliases: ['Don Valley Station'] },

  // ── Pearson Link (Other) ───────────────────────────────────────────────
  { name: 'Terminal 3', code: '', agency: 'Other', aliases: ['Terminal 3'] },
  { name: 'Viscount', code: '', agency: 'Other', aliases: ['Viscount'] },

  // ── GO Transit ─────────────────────────────────────────────────────────
  { name: 'Exhibition', code: '', agency: 'GO Transit', aliases: ['Exhibition'] },
  { name: 'Markham', code: '', agency: 'GO Transit', aliases: ['Markham'] },
  { name: 'Bronte', code: '', agency: 'GO Transit', aliases: ['Bronte Go', 'Bronte'] },
  { name: 'Union Station', code: '', agency: 'GO Transit', aliases: ['Union Station'] },

  // ── MiWay ─────────────────────────────────────────────────────────────
  { name: 'Port Credit', code: '', agency: 'MiWay', aliases: ['Port Credit Go', 'Port Credit Station', 'Port Credit'] },
  { name: 'Humber College', code: '', agency: 'MiWay', aliases: ['Humber College'] },
  { name: 'City Centre Transit Terminal', code: '', agency: 'MiWay', aliases: ['City Centre Transit Terminal'] },

  // ── YRT ───────────────────────────────────────────────────────────────
  { name: 'Hwy 7 / Galsworthy', code: '', agency: 'YRT', aliases: ['Hwy 7/Galsworthy Dr', 'Hwy 7 / Galsworthy'] },

  // ── Oakville Transit ───────────────────────────────────────────────────
  { name: 'Laird / Ridgeway', code: '3174', agency: 'Oakville Transit', aliases: ['3174 (laird / Ridgeway)', 'Laird + Ridgeway', 'Laird / Ridgeway'] },
  { name: 'Oakville Go', code: '', agency: 'Oakville Transit', aliases: ['Oakville Go'] },
  { name: 'Uptown Core Terminal', code: '', agency: 'Oakville Transit', aliases: ['Uptown Core Terminal'] },
];

async function run() {
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  const snap = await db.collection('stops').get();
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const def of STOPS) {
    const canonicalAliases = def.aliases.filter(a => a !== def.name);

    // Match by code + agency (most precise) or name + agency if no code
    let found;
    if (def.code) {
      found = existing.find(s => s.code === def.code && s.agency === def.agency);
    } else {
      found = existing.find(s => s.name === def.name && s.agency === def.agency && !s.code);
    }

    if (found) {
      const merged = [...new Set([...(found.aliases || []), ...canonicalAliases])];
      const added = merged.filter(a => !(found.aliases || []).includes(a));
      if (added.length) {
        console.log(`UPDATE  "${def.name}" (${def.agency}${def.code ? ' #' + def.code : ''}) +${added.length} alias(es)`);
        if (!DRY_RUN) await db.collection('stops').doc(found.id).update({ aliases: merged, updatedAt: new Date() });
        updated++;
      } else {
        console.log(`SKIP    "${def.name}" (${def.agency}${def.code ? ' #' + def.code : ''}) — already exists`);
        skipped++;
      }
    } else {
      console.log(`CREATE  "${def.name}" (${def.agency}${def.code ? ' #' + def.code : ''}) — ${canonicalAliases.length} alias(es)`);
      if (!DRY_RUN) {
        await db.collection('stops').add({
          name: def.name,
          code: def.code || '',
          agency: def.agency,
          aliases: canonicalAliases,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      created++;
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated, ${skipped} skipped.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
