# Handoff — 2026-04-21

## What was done this session (2026-04-21)

### SMS reply bug fixed — all messages were silently dropped
The idempotency fix in b385882 added a `processedMessages/{MessageSid}` write to `sms.js` before calling `dispatch()`. But `checkIdempotency()` in the dispatcher already does the same atomic write — so every message's first write succeeded in `sms.js`, then `checkIdempotency` got ALREADY_EXISTS and returned `true`, dropping every message with no reply. Fixed by removing the redundant write from `sms.js`. The dispatcher's `checkIdempotency` is the sole owner of MessageSid deduplication.

**Files:** `functions/sms.js`

---

### LA Metro G Line and J Line added to topology
Both BRT lines now have full stop sequences in `topology.json`. G Line (Orange): 17 stops, North Hollywood → Chatsworth. J Line (Silver): 13 key stops, El Monte → Harbor Gateway Transit Center via Union Station and the Harbor Transitway. Enables direction filtering from the first trip on either line. Stop lists verified against Wikipedia.

**Files:** `functions/lib/topology.json`

---

### 510 trip stop name backfill
10 trips on routes 510/510a/510b had `null` startStopName or endStopName despite having valid stop codes. Backfilled GTFS canonical names using `startStopCode`/`endStopCode`. Each corrected trip tagged with `corrected: ['startStopName']` or `corrected: ['endStopName']` in Firestore for auditability. One trip (`JF0uHmCBqxILYyBhXDbL`) could not be recovered — null name and null code.

---

### 510 speed/distance CSVs exported
Two CSVs on Ryan's Desktop: `510_Northbound.csv` and `510_Southbound.csv`. Each trip has `dist_km` (haversine between stop coordinates) and `speed_kmh` (dist / duration). Coordinates sourced from actual GPS boardingLocation/exitLocation where available, GTFS stop lookup otherwise. 90/91 trips have speed calculated. `coord_source` column indicates `gps` vs `gtfs` vs `missing`.

---

## What was done previously (2026-04-19)

### Stop disambiguation starts trip immediately
When a stop name is ambiguous (multiple matches) and there's no active trip conflict, the trip now starts at send time with a null start stop. User gets "510 started. Multiple stops match...: Reply with a number to set your stop, or DISCARD to cancel." If they never reply, the trip counts for time-on-transit but not origin stop stats — same outcome as FORGOT. This was triggered by Ryan boarding the 510 and not seeing the disambiguation prompt for 3+ minutes.

**Files:** `functions/lib/handlers.js` (disambiguation block), `functions/lib/dispatcher.js` (confirm_stop handler)

---

### NetworkEngine v1 — self-learning transit graph
New third prediction engine (`functions/lib/network.js`). Each trip end writes an edge `fromStop → toStop` with duration to Firestore (`networkGraph` collection). At trip start, the graph is loaded and used as a higher-priority directional filter than topology.json. Falls back to topology.json if fewer than 3 trips on an edge.

**Why:** topology.json can't represent branchy networks like BART. NetworkEngine learns any network automatically — BART, Muni, LA Metro, and future cities all build their graph from rides.

**Key design decisions:**
- Only canonical stop names are written — raw/unrecognized names are skipped entirely
- Route variants pool together (510a, 510b, 510 Shuttle → all write to `ttc_510` doc)
- Reverse-edge inference: B→A westbound implies A is reachable from B eastbound
- One Firestore doc per user/agency/route: `{userId}_{agency}_{route}`

**Files:** `functions/lib/network.js`, `functions/lib/predict.js` (networkGraph property + _preFilterCandidatesByTopology), `functions/lib/handlers.js` (load at trip start, observe at trip end)

**Tools:**
- `Tools/backfill-network-graph.js` — seeds graph from all existing trips (canonical only, skips unresolved)
- `Tools/topup-network-graph.js "Stop Name"` — run after normalizing new stops; finds affected trips and adds them to the graph
- `Tools/audit-unresolved.js` — lists all unresolved stop names from trips with route + direction per entry

**Current state:** 265/409 trips processed. 144 skipped due to unresolved stops. Graph has data for Lines 1, 2, 510 and others. Eglinton Station added and topped up (4 trips).

---

### Prediction direction fixes (V3 + topology)
- **Direction bleeding**: `_preFilterCandidatesByTopology` and `_applyTopologyFilter` used to fall back to unfiltered candidates when topology produced zero results — so eastbound from Spadina showed westbound stops. Now returns empty (no prediction) rather than wrong-direction predictions, when topology fully covers the route.
- **Union Station pivot**: Boarding at Union now skips topology filtering entirely — either branch (Yonge or University) is valid from there.

---

### STATS — "Top route" on its own line
Was appended inline: `"Last 30 days: ... · Most ridden: 1 (39×)"`. Now a separate paragraph: `"Top route: 1 (39×)"`. "Ridden" also replaced.

---

### Raw trip corrections made this session
Several trips had wrong stop names, directions, or agencies. All corrected directly in Firestore:

| Trip ID | Field corrected | Old value | New value |
|---|---|---|---|
| `Kw7p36cy2yUf7jWSEZmN` | endStopName | "Spadina & Ossington 7817" | "Harbord / Spadina" |
| `d267YaRySARgAF5wbkI7` | endStopName | "College / Jarvis" | "Dundas / Jarvis" |
| `ZooteOdNdEcWj0DsltGj` | endStopName + direction | "Dundas/Dupont" + Northbound | "Dundas / Dupont" + Westbound |
| `fubaqvN5im0wLFeCi0Rt` | direction | Northbound | Eastbound |
| `5RErYqVy45CcUMmZnpGR` | direction | Westbound | Eastbound |
| `f0UuhPCtNcEwqjByJRGo` | direction | Southbound | Eastbound |
| `39OgpY6dqtavjFTmGeUi` | agency | TTC | GO Transit |
| `a1KojTFOHNqL0PGqGeDR` | direction | Southa | Southbound |
| `NUT3wwHwIu6zbFS8lO26` | agency | TTC | Oakville Transit |
| `q4MXtohbqLdPQgz4e8LF` | agency | TTC | Oakville Transit |
| `SHLa987MCjgnabdhQAhC` | startStopName + vehicle | "Keele (Vehicle Number 7109...)" | "Keele" + vehicle: "7109 Hybrid Electric" |
| `1gaiVPXwmNCuL14sFUZk` | endStopName | "Terminal 3 (14092)" | "Terminal 3" |
| `H9RYXIjZze19tMsfOy0k` | direction | Eastbound | Northbound |
| `7Nsknq0fHMVoIA0sjpbN` | startStopName + direction | "East" + "Port Credit" | "Port Credit" + Eastbound |

---

## What still needs to happen

### Deploy
Nothing has been deployed yet. All changes are local. Run:
```
firebase deploy --only hosting,functions
```

### Create stops in admin UI + link inbox trips
All stops below were researched this session. None have been created yet. For each: create in admin UI, then link trips in the inbox. After all stops are created, run `node Tools/topup-network-graph.js "Canonical Name"` for each canonical name.

**Key rule:** stops at the same intersection are separate entries per direction/route (different physical poles). Same canonical name is fine — stop code differentiates them. Name-based trips trigger disambiguation; stop-code trips resolve directly.

#### TTC — Spadina line (510)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Spadina / King | 7353 | Northbound | Spadina / King, Spadina/King, Spadina/king, 13161 Spadina / King |
| Spadina / King | 8126 | Southbound | Spadina / King |
| Spadina / Richmond | 11985 | Northbound | Spadina / Richmond, Spadina & Richmond St W, Spadina / Richmond St W, Spadina/richmond |
| Spadina / Harbord | 7351 | Northbound | Spadina / Harbord |
| Spadina / Harbord | 8124 | Southbound | Spadina/harbord, Harbord / Spadina, 8124 Spadina and Harbord |
| Spadina / Queen | 7355 | Northbound | Spadina and Queen 7355 |
| Spadina / Queen | 8129 | Southbound | Spadina / Queen St W, Spadina & Queen, Spadina / Queen |
| Nassau / Spadina | 11986 | Northbound | Nassau / Spadina, Nassau/Spadina, SPADINA & NASSAU 11986, Nassau and Spadina 11986, 11986 Spadina & Nassau |
| Nassau / Spadina | 8128 | Southbound | Spadina and Nassau |
| Nassau & Sullivan | 8131 | Southbound | Nassau & Sullivan |
| Spadina / Dundas | 7349 | Northbound | Spadina / Dundas, Spadina/Dundas |
| Spadina / Dundas | 8121 | Southbound | Spadina / Dundas St W S |
| Spadina / College | 7347 | Northbound | Spadina / College |
| Spadina / College | 8120 | Southbound | SPADINA / COLLEGE SOUTH, Spadina / College |
| Spadina / Bremner | 10777 | Northbound | Spadina / Bremner, Bremner N / Spadina |
| Spadina / Bremner | 10929 | Southbound | (no unresolved trips — create for future use) |
| Spadina / Front St W | 7346 | Northbound | 7346 Spadina Avenue and Front St., West |
| Spadina / Queens Quay West | 12085 | Northbound | Spadina / Queens Quay West North |

#### TTC — King line (504)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Spadina / King | 15648 | Eastbound | (no unresolved trips — create for future use) |
| Spadina / King | 15647 | Westbound | (no unresolved trips — create for future use) |

#### TTC — Dundas line (505)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Spadina / Dundas | 2189 | Eastbound | Spadina & Dundas St West |
| Spadina / Dundas | 2190 | Westbound | Spadina and Dundas W |
| Dundas / Jarvis | 2118 | Eastbound | Dundas / Jarvis, Dundas/Jarvis |
| Dundas / Sterling | 991 | Eastbound | Dundas / Sterling, Dundas/Sterling, Dundas/Sterlingp |
| Dundas / Beverley | 2146 | Eastbound | Dundas W/Beverely St, Dundas / Beverley |
| Dundas / Dupont | 3493 | Westbound | Dundas / Dupont, Dundas/Dupont |

#### TTC — Carlton line (506)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Carlton / Church | 751 | Eastbound | CARLTON & CHURCH, Church/carlton |
| Carlton / Church | 752 | Westbound | Carlton / Church, Church / Carlton |
| Dufferin / College | 826 | Eastbound | 826 College & Dufferin, Dufferin / College, College / Dufferin |
| Dufferin / College | 827 | Westbound | (no unresolved trips — create for future use) |
| Spadina / College | 843 | Eastbound | (no unresolved trips — create for future use) |
| Spadina / College | 844 | Westbound | COLLEGE & SPADINA, College &spadina |
| Gerrard / Pape | 1100 | Eastbound | Gerrard / Pape |
| Gerrard / Pape | 1101 | Westbound | Gerrard/Pape, 1101 Gerrard St E / Pape |
| Gerrard / Jones | 1092 | Eastbound | Gerrard/Jones |
| Gerrard / Jones | 1093 | Westbound | Gerrard/Jones |
| Carlton / Jarvis | 753 | Eastbound | Carlton / Jarvis |
| College / Beverley | 815 | Eastbound | College & Beverley, College / Beverly |
| College / Euclid | 831 | Westbound | College / Euclid |
| College / Augusta (Major) | 12338 | Westbound | College / Augusta, College / Major |
| College / Brock | 819 | Westbound | College / Brock |
| College / Lansdowne | 835 | Eastbound | College / Lansdowne |
| College / Dufferin | 826 | Eastbound | (same as Dufferin / College 826 above) |
| Queen's Park | 847 | Eastbound | QUEEN'S park 847, Queen's Park |
| College Station | 760 | Westbound | College 760 |

#### TTC — Dufferin line (29/929)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Dufferin / College | 2034 | Southbound | Dufferin&college, Dufferin / College, Dufferin/College 2034 |
| Dufferin / College | 2033 | Northbound | (no unresolved trips — create for future use) |
| Dufferin / Apex Rd | 2016 | Southbound | Dufferin / Apex Rd S |
| Dufferin / Lawrence | 2070 | Southbound | Dufferin/lawrence, Dufferin / Lawrence |
| Dufferin Gate Loop | 2032 | Southbound | Dufferin / Dufferin Gate, Dufferin Gate Loop |

#### TTC — Harbord/Wellesley line (94)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Spadina / Harbord | 7817 | Eastbound | Spadina / Harbord, Harbord / Spadina |
| Spadina / Harbord | 7818 | Westbound | Spadina / Harbord |

#### TTC — Bathurst line (511)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Bathurst / Nassau | 178 | Southbound | Bathurst / Nassau |
| Bathurst / Nassau | 16454 | Northbound | Bathurst / Nassau |
| Bathurst / King | 162 | Southbound | Bathurst / King |
| Bathurst / King | 161 | Northbound | Bathurst / King |
| Bathurst / Fort York | 100 | Southbound | Bathurst / Fort York |
| Bathurst / Queen W | 186 | Northbound | Bathurst/Queen W |
| Bathurst / College | 110 | Northbound | Bathurst/College |
| Exhibition Loop | 12584 | Northbound | Exhibition Loop |

#### TTC — Lawrence West line (52)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Lawrence Av W / Pimlico Rd | 5394 | Eastbound | 5394 Lawrence Av W / Pimilco Road, 5394 Lawrence Av W / Pimloco Rd |
| Lawrence Av W / Pimlico Rd | 5393 | Westbound | LAWRENCE AV W / Pimlico Rd W, Lawrence / Pimilco, Lawrence / Pilimco, Lawrence Av W / Pimlico, Lawrence Av West / Pimlico Rd W |
| Lawrence Av W / Duval Dr | 5366 | Eastbound | LAWRENCE AV W & Duval Dr, Lawrence Av W / Duval Dr, Lawrence Av W / Duval Dr 5366, Lawrence Av / Duval, 5366 Lawrence / Duval, 5366 Lawrence Av W / Duval Dr |
| Lawrence Av W / Duval Dr | 5367 | Westbound | (no unresolved trips — create for future use) |
| Lawrence / Kennedy | 4096 | Southbound | Lawrence / Kennedy, Kennedy / Lawrence |

#### TTC — Parliament line (65)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Parliament / Gerrard | 6650 | Southbound | Parliament / Gerrard, Parliament & Gerrard (also serves 506) |
| Parliament / Mill | 5996 | Southbound | Parliament / Mill |

#### TTC — Lansdowne line (47)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Lansdowne / Dupont | 4401 | Northbound | Lansdowne & Dupont |
| Lansdowne / Dupont | 4402 | Southbound | Lansdowne / Dupont |
| College / Lansdowne | 5212 | Southbound | College / Lansdowne |

#### TTC — Wilson line (96)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Wilson / Bathurst | 8840 | Westbound | Wilson Av / Bathurst St W, Wilson / Bathurst |

#### TTC — Bathurst line (7)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Bathurst / Wilson | 223 | Southbound | Bathurst / Wilson |

#### TTC — Queen line (501)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Ossington / Queen | 6847 | Westbound | Ossington / Queen |
| Queen / Dovercourt | 6831 | Eastbound | Queen / Dovercourt |
| Queen / Dunn | 6835 | Eastbound | Queen / Dunn |

#### TTC — Kingston Rd line (503)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| King / Sherbourne | 4145 | Eastbound | King / Sherbourne |
| Queen St E / Carlaw | 3035 | Eastbound | Queen St E / Carlaw Av |

#### TTC — King line (504)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| King / Church | 12537 | Eastbound | King / Church, King/Church |

#### TTC — Jones line (83)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Jones / Gerrard | 1188 | Southbound | Jones/Gerrard, 1188 Jones & Gerrard, Jones / Gerrard |
| Leslie / Commissioners | 1238 | Southbound | Leslie/Commissioners |

#### TTC — Pape line (72)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Carlaw / Gerrard | 6289 | Southbound | Carlaw/Gerrard |
| Carlaw / Queen St E | 4858 | Northbound | 4858 Carlaw & Queen St E |

#### TTC — Davenport line (127)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Davenport / Ossington | 950 | Eastbound | Davenport / Ossington |

#### TTC — Ossington line (63)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Ossington / College | 5957 | Southbound | Ossington / College |

#### TTC — Keele line (41)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Sentinel / The Pond | 7992 | Eastbound | Sentinel Road / The Pond Road South 7992, Sentinel / The Pond |
| Keele / Broadoaks | 9148 | Southbound | Keele / Broadoaks |
| Keele / Lawrence | 9152 | Southbound | Keele / Lawrence Av W |
| St Clair W / Weston | 15750 | Southbound | St Clair W / Weston |

#### TTC — Weston line (89)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Keele / St Clair W | 11689 | Northbound | Keele / St Clair W |

#### TTC — Flemingdon Park line (100)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Broadview / Mortimer | 657 | Northbound | Broadview Av / Mortimer Av N |

#### TTC — Ancaster Park line (184)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Gilley / Garratt | 1130 | Eastbound | Gilley / Garratt, Gilley /garratt |

#### TTC — Pharmacy line (67)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Pharmacy / Eglinton | 6697 | Northbound | 6697 Pharmacy & Eglinton |
| Pharmacy / Lawrence | 6722 | Northbound | Pharmacy / Lawrence |

#### TTC — Harbourfront line (509)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Fleet / Bastion | 14512 | Eastbound | Fleet / Bastion |
| Fleet / Bathurst | 10210 | Eastbound | Fleet / Bathurst |
| Queens Quay W / Lower Spadina | 13131 | Eastbound | Queens Quay W / Lower Spadina E, Queens Quay W / Lower Spadina Av East Side |
| Queens Quay W / Dan Leckie Way | 13367 | Westbound | Queens Quay W / Dan Leckie Way W |
| Harbourfront Centre | 15332 | Eastbound | Harbourfront Centre |

#### TTC — Queens Quay / Ferry (114)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Queens Quay E / Lower Jarvis | 15129 | Westbound | Lower Jarvis/Queens Quay E |
| Jack Layton Ferry Terminal | 262 | Westbound | Bay/Queens Quay/Ferry Docks |

#### TTC — Airport Express (900)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Terminal 3 | 14278 | Northbound | Terminal 3 |

#### TTC — Airport-Humber (906)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Viscount Station | 16760 | Northbound | Viscount Station |
| Humber College Terminal | 15406 | Northbound | Humber College Terminal |

#### TTC — Highway 27 Express (927)
| Canonical name | Code | Direction | Aliases |
|---|---|---|---|
| Humber College Blvd / Hwy 27 | 11272 | Northbound | Humber College Blvd / Hwy 27 W |

#### TTC — Subway stations (no stop code)
| Canonical name | Notes |
|---|---|
| Donlands | Line 2 |
| Vaughan Metropolitan Centre | aliases: VMC, Vmc |
| Richmond Hill Centre | ORANGE/PURPLE lines |
| Uptown Core Terminal | **agency: Oakville Transit** (not TTC) |
| Keelesdale | aliases: Keelsdale, Keelesdale |
| Leaside | Line 5 Eglinton |
| Laird | Line 5 Eglinton |
| Don Valley | Line 5 Eglinton |
| Pharmacy | Line 5 Eglinton |
| Museum | Line 1 |
| Jane | Line 2 |
| Keele | Line 2 |
| Queens Quay | Underground streetcar station |

#### TTC — Pearson Link (Other agency)
| Canonical name | Notes |
|---|---|
| Terminal 3 | agency: Other |
| Viscount | agency: Other |

#### GO Transit (no stop code)
| Canonical name | Aliases |
|---|---|
| Exhibition | Exhibition |
| Markham | Markham |
| Bronte | Bronte Go |
| Union Station | Union Station |

#### GO Transit — Port Credit (MiWay trips — note agency)
| Canonical name | Agency | Aliases |
|---|---|---|
| Port Credit | MiWay | Port Credit Go, Port Credit Station, Port Credit |

#### MiWay (no stop code — skipped for now)
- Humber College
- City Centre Transit Terminal
- Lakeshore / Beechwood

#### YRT (no stop code)
| Canonical name | Aliases |
|---|---|
| Hwy 7 / Galsworthy | Hwy 7/Galsworthy Dr |

#### Oakville Transit
| Canonical name | Code | Aliases |
|---|---|---|
| Laird / Ridgeway | 3174 | 3174 (laird / Ridgeway), Laird + Ridgeway |
| Oakville Go | (none) | Oakville Go |
| Uptown Core Terminal | (none) | Uptown Core Terminal |

---

### Webhook idempotency — FIXED
Twilio webhook retries now deduplicated via `processedMessages/{MessageSid}` Firestore collection. Each incoming message atomically creates a document before dispatch — retries see ALREADY_EXISTS and return empty TwiML immediately. Body is stored alongside `processedAt` and `from` for audit/troubleshooting. Documents kept permanently (useful for debugging missing or duplicate trips).

### Still unresolved after this session
All major trips corrected. Remaining unresolved stop names in the audit are low-value 1× singles from infrequent routes — address as they come up organically.
- **"St Clair W / Hounslow Heath Rd"** (510 Eastbound board) — unusual — 510 runs N/S. Pull trip and investigate.
- **"Kipling"** (MiWay route 1 Westbound board) — MiWay stop, skipped for now.
- **"Laird & West Of Ridgeway"** (MiWay route 1 Westbound exit) — MiWay stop, skipped for now.

---

### Vehicle field feature
A `vehicle` field was added to trip `SHLa987MCjgnabdhQAhC` (Keele → 89 Northbound, vehicle 7109 Hybrid Electric) as a proof of concept. To complete the feature:
- Update the SMS parser (`functions/lib/handlers.js`) to recognize and write `vehicle` when a vehicle number is included in the trip message
- Update the UI to display `vehicle` where relevant (trip detail view)
- Trips logged before the feature just won't have the field — handle as `trip.vehicle || null`

### CHANGELOG cleanup
The [Unreleased] section has some duplicate content in the STATS entry — got merged in by accident. Worth cleaning up before the next version bump.

---

## Engine stack summary
| Engine | What it does | Status |
|---|---|---|
| **V3 (PredictionEngine)** | Historical voting for route + end stop | Active, direction fixes applied |
| **V4 (logistic regression)** | End stop prediction | Active |
| **V5 (XGBoost)** | End stop prediction | Active |
| **TransferEngine** | Journey linking | Active |
| **NetworkEngine v1** | Transit graph, directional filtering | Built, backfilled, not yet deployed |

---

## Ryan is travelling to LA and SF
BART, Muni, and LA Metro lines are in topology.json (including G and J BRT lines added this session). NetworkEngine will start learning those networks from the first ride. Note: NetworkEngine requires MIN_TRIPS=3 on any edge before it contributes to predictions — topology.json carries all the weight on a short visit.

## Current version
v1.25.0 — released 2026-04-20. Functions deployed.
