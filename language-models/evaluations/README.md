# LLM Evaluations

Store one immutable report per prompt/model evaluation. Use a filename such as `2026-08-26-sms-stop-disambiguation.md`.

Each report must state:

- User task and expected behavior
- Model, prompt, and relevant code versions
- Fixture/source set and privacy handling
- Pass/fail criteria and results with denominators
- Failure categories and representative IDs or redacted examples
- Safety/data-boundary checks
- Decision and next test

Keep raw model outputs under the ignored `raw/` directory. Never commit private trip text, phone numbers, tokens, or unredacted user data.
