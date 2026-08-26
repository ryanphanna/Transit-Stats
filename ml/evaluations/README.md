# ML Evaluations

Store one immutable Markdown report per evaluation. Use a filename such as `2026-08-26-v6-ttc-endstop.md`.

Each report must state:

- Question or hypothesis
- Exact dataset, filters, and date range
- Model and artifact versions
- Evaluation method and whether it is backtest, replay, shadow, or live
- Results with denominators
- Limitations and possible leakage
- Decision and next test

Do not overwrite an old report. Put generated exports and raw outputs under the ignored `ml/artifacts/` or `ml/reports/` directories.
