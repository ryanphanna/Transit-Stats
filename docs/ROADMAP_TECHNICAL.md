# Technical Roadmap

Technical foundation and scaling initiatives to support growth and long-term stability.

## Engine & Data

- [ ] **Prediction Accuracy**: Monitor the weighted-voting engine (`v2`) for accuracy against real-world logs to hit the 90% goal before enabling UI suggestion cards.
- [ ] **Wait Time Inference**: Logic for estimating boarding wait times by comparing "Confirm Start" timestamps with first vehicle position data.
- [ ] **Anomaly Detection**: Automatically identifying "bad data" points or "teleportation" trips for sanitization.
- [ ] **Legacy Data Import**: High-fidelity parser for PRESTO or TTC export files to backfill historical user data.

## Future Initiatives

- [ ] **Advanced Graph Mapping**: Representing routes as continuous lines (not just points) by traversing path nodes between boarding and alighting coordinates.
- [ ] **Multimodal Engine Support**: Extending the prediction and logging logic to support Amtrak, GO Transit, and regional buses beyond the base agency.

---

[Back to Roadmap](../ROADMAP.md)
