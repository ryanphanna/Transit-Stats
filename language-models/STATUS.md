# LLM Status

Current state of language-model features. Dated output-quality investigations belong under `evaluations/`; accepted behavior changes belong under `decisions/`.

## Production role

- Gemini interprets SMS/MMS trip input and supports natural-language trip queries where enabled.
- Raw trip history remains account-scoped; prompts should include only context relevant to the requested task.
- Parsed or generated output must remain subject to deterministic validation and transit-specific constraints.

## Evaluation rule

Do not treat a plausible sample response as evidence of production quality. Record the prompt/model version, fixture set, expected behavior, failure categories, and pass rate in a dated evaluation.

## Canonical references

- Product and intelligence architecture: [Intelligence](../docs/INTELLIGENCE.md)
- Data/privacy boundaries: [Security](../docs/SECURITY.md) and [Trip Data Model](../docs/TRIP_DATA_MODEL.md)
