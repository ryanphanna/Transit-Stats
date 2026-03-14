# Roadmap

This document outlines the feature roadmap for the Transit Stats application.

- **[Engine](./docs/ROADMAP_TECHNICAL.md):** Underlying technology, data processing, and prediction logic goals.

## Features

- **Transit Wrapped:** Visual year-in-review based on internal app data with interactive highlights and shareable summary cards.
- **Suggested Routes:** Dashboard cards that proactively suggest trips based on the prediction engine (once evaluation hits 90%).
- **Route Heatmaps:** Visual distribution maps of the user's most frequent transit corridors.
- **Custom Goal Tracker:** Users can set goals for transit usage (e.g. "Take 20 trips this month") with progress visualization.
- **Stop Normalization Tool:** Assisted review UI for consolidating duplicate stop entries. Surfaces merge candidates based on name similarity, coordinates, route, and direction — user manually confirms or rejects each pair.

Behind the scenes, we are building **[NextGen TransitStats](./docs/ROADMAP_NEXTGEN.md)**: a transit modeling engine R&D initiative focusing on passive logging, semantic stop resolution, and autonomous trip synthesis.

---

[Back to Home](./README.md)