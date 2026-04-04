# Transit Stats

A premium transit trip tracker for enthusiasts to analyze ridership patterns and visualize personal transit usage using Google Gemini.

## Problem

Transit riders lack a unified, personal way to track their journeys across multiple agencies. Official apps are often siloed, focus only on real-time arrivals, and provide no long-term historical analysis or visualization of personal transit habits.

## Features

- **Real-time Recording**: Start and end trips to capture routes, stops, and durations with GPS-backed boarding/alighting data.
- **AI-Powered SMS**: Log trips using natural language via Twilio and Gemini AI, extracting routes and stops from simple text messages.
- **Analytics & Heatmaps**: Visualize transit usage through personal stats, riding streaks, and geographic heatmaps.
- **Multi-Agency Support**: Native support for TTC, OC Transpo, GO Transit, and other North American transit agencies.

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
