# Technical Roadmap

Technical foundation and scaling initiatives to support growth and long-term stability.

## Engine & Data

- [ ] **Prediction Accuracy Goal**: Engine is v3, predictions are now committed at trip start and graded at end. Running accuracy tracked in `predictionAccuracy/{userId}`. Route prediction, start-time end stop prediction, and duration-informed end stop prediction are all tracked separately. Goal is 90% route accuracy before enabling UI suggestion cards.
- [ ] **`getRecentCompletedTrips` date bound**: No lower date bound on history fetch — will eventually scan hundreds of trips on every start. Add a rolling 6-month window once data volume warrants it.
- [x] **Gemini API key rotation**: Resolved 2026-03-13. New key generated in Google AI Studio and updated in Cloud Secret Manager.
- [ ] **Wait Time Inference**: Logic for estimating boarding wait times by comparing "Confirm Start" timestamps with first vehicle position data.
- [ ] **Anomaly Detection**: Automatically identifying "bad data" points or "teleportation" trips for sanitization.
- [ ] **Stop Normalization Tool**: Assisted review UI for consolidating duplicate stop entries. Surfaces merge candidates based on name similarity, coordinates, route, and direction — user manually confirms or rejects each pair.
- [ ] **Legacy Data Import**: High-fidelity parser for TTC export files to backfill historical user data. (PRESTO importer removed — too fragile and caused main app instability.)

## Security

- [ ] **Server-side auth rate limiting**: Currently handled client-side (5 attempts → 15 min lockout via localStorage). Upgrade to server-side enforcement using Firebase App Check or a Cloud Function login proxy to prevent bypass via devtools/storage clearing.

## Future Initiatives

- [ ] **Advanced Graph Mapping**: Representing routes as continuous lines (not just points) by traversing path nodes between boarding and alighting coordinates.
- [ ] **Multimodal Engine Support**: Extending the prediction and logging logic to support Amtrak, GO Transit, and regional buses beyond the base agency.

---

[Back to Roadmap](../ROADMAP.md)
