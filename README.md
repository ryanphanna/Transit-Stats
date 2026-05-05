# Transit Stats

A premium transit trip tracker for enthusiasts to analyze ridership patterns and visualize personal transit usage using Google Gemini.

## Problem

Transit riders lack a unified, personal way to track their journeys across multiple agencies. Official apps are often siloed, focus only on real-time arrivals, and provide no long-term historical analysis or visualization of personal transit habits.

## Features

- **SMS Trip Logging**: Text a route and stop to start a trip; text END to finish. Supports stop names, stop codes, and direction shorthands (NB, EB, etc.).
- **Snap-to-Start (MMS)**: Send a photo of a stop sign pole — Gemini Vision extracts the route and stop code and starts the trip automatically. Boarding time is set to when the photo was sent.
- **Route + Direction-Aware Stop Resolution**: When a stop name matches multiple physical stops (e.g. an intersection served by two different routes), the system filters candidates by route then direction and auto-selects — no disambiguation prompt if the trip context is unambiguous.
- **Analytics & Heatmaps**: Visualize transit usage through personal stats, riding streaks, and geographic heatmaps.
- **AI Trip Queries**: Ask natural-language questions about your ride history via Gemini.
- **Multi-Agency Support**: Native support for TTC, OC Transpo, GO Transit, and other North American transit agencies.
- **Self-Learning Network Graph**: Each completed trip teaches the system stop sequences and travel times per route. Global graph cold-starts predictions for new users; personal graph personalizes over time.

## Stack

- **AI**: Google Gemini (Flash & Pro)
- **Frontend**: Vanilla JS, HTML5, CSS3, Leaflet (Mapping)
- **Backend**: Firebase (Auth, Firestore, Hosting)
- **Communications**: Twilio Messaging API (RCS with SMS fallback)

---

- [Roadmap](./ROADMAP.md)
- [Changelog](./CHANGELOG.md)
- [Security](./SECURITY.md)

Created by [Ryan Hanna](https://github.com/ryanphanna) | [ryanisnota.pro](https://ryanisnota.pro)
