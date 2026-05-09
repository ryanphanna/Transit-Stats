# Transit Stats

A premium transit trip tracker for enthusiasts to analyze ridership patterns and visualize personal transit usage using Google Gemini.

## Problem

Transit riders lack a unified, personal way to track their journeys across multiple agencies. Official apps are often siloed, focus only on real-time arrivals, and provide no long-term historical analysis or visualization of personal transit habits.

## Features

- **SMS Trip Logging**: Text a route and stop to start a trip; text END to finish. Supports stop names, stop codes, and direction shorthands (NB, EB, etc.).
- **Snap-to-Start (MMS)**: Send a photo of a stop sign pole — Gemini Vision extracts the route and stop code and starts the trip automatically.
- **Route + Direction-Aware Stop Resolution**: When a stop name matches multiple physical stops, the system filters candidates by route then direction and auto-selects.
- **Public Profiles & Analytics**: Share your ridership stats and streaks via a public-facing profile page. Visualize usage through heatmaps and personal records.
- **AI Trip Queries**: Ask natural-language questions about your ride history via Gemini.
- **Multi-Agency Support**: Native support for TTC, OC Transpo, GO Transit, and other North American transit agencies.
- **Self-Learning Network Graph**: Each completed trip teaches the system stop sequences and travel times per route.

## Stack

- **AI**: Google Gemini (Flash & Pro)
- **Frontend**: Vanilla JS (ES Modules), Vite, Leaflet (Mapping)
- **Backend**: Firebase (Auth, Firestore, Hosting, Cloud Functions)
- **Communications**: Twilio Messaging API (SMS/MMS)

---

- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)
- [Security](./SECURITY.md)
- [Documents](./DOCUMENTS.md)

Created by [Ryan Hanna](https://github.com/ryanphanna) | [ryanisnota.pro](https://ryanisnota.pro)
