# Technical Roadmap

Technical foundation and scaling initiatives to support growth and long-term stability.

## Engine & Data

- [ ] **Prediction Accuracy Goal**: Engine is v3, predictions are now committed at trip start and graded at end. Running accuracy tracked in `predictionAccuracy/{userId}`. Route prediction, start-time end stop prediction, and duration-informed end stop prediction are all tracked separately. Goal is 90% route accuracy before enabling UI suggestion cards.
- [ ] **`getRecentCompletedTrips` date bound**: No lower date bound on history fetch — will eventually scan hundreds of trips on every start. Add a rolling 6-month window once data volume warrants it.
- [ ] **Gemini API key rotation**: Key flagged as invalid in function logs as of 2026-03-09. Likely leaked via the same `.env` commit that exposed the Twilio token (v1.4.2) — Twilio was rotated at the time but Gemini was not. Natural language queries and freeform SMS parsing are broken until a new key is generated in Google AI Studio and the `GEMINI_API_KEY` secret is updated in Cloud Secret Manager.
- [ ] **Wait Time Inference**: Logic for estimating boarding wait times by comparing "Confirm Start" timestamps with first vehicle position data.
- [ ] **Anomaly Detection**: Automatically identifying "bad data" points or "teleportation" trips for sanitization.
- [ ] **Legacy Data Import**: High-fidelity parser for PRESTO or TTC export files to backfill historical user data.

## Future Initiatives

- [ ] **Advanced Graph Mapping**: Representing routes as continuous lines (not just points) by traversing path nodes between boarding and alighting coordinates.
- [ ] **Multimodal Engine Support**: Extending the prediction and logging logic to support Amtrak, GO Transit, and regional buses beyond the base agency.

---

[Back to Roadmap](../ROADMAP.md)
