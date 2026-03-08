# Engine Roadmap

This document profiles the technical evolution of the Transit Stats backend, specifically focusing on the transit data engine and prediction logic. Product-level features are tracked in the main [ROADMAP](./ROADMAP.md).

## Current Phase: Silent Evaluation (v2)
- **Prediction Accuracy (Goal: 90%)**: Monitoring the weighted-voting engine (`v2`) for accuracy against real-world logs. 
- **Wait Time Inference**: Logic for estimating boarding wait times by comparing "Confirm Start" timestamps with first vehicle position data (where available).

## Future Technical Milestones

- **Predictive Alerts**: Gemini-powered notifications sent before a user usually travels if their route has significant delays.
- **Legacy Data Import**: High-fidelity parser for PRESTO/TTC export files to backfill historical user data.
- **Advanced Graph Mapping**: Representing routes as continuous lines (not just points) by traversing path nodes between boarding and alighting coordinates.
- **Multimodal Engine Support**: Extending the prediction and logging logic to support Amtrak, GO Transit, and regional buses beyond the base agency.
- **Anomaly Detection**: Identifying "bad data" points or "teleportation" trips automatically for sanitization.
