# ADR-0010: Optional local AI behind a provider interface

Status: Accepted · 2026-10-28

## Decision

`packages/ai` defines `ExplanationProvider`. The default is `NoopProvider`.
`OllamaProvider` talks to a loopback Ollama server. It is used only by the
worker, only when `SYNAPSE_AI_PROVIDER=ollama`, and only for explaining existing
findings. The model gets no tools. Its output is labelled, sanitized, and
display-only. Any future fix suggestion is shown as a diff for the user to apply
manually.

## Consequences

- \+ No paid APIs. The core product is complete without AI.
- − Quality depends on the local model and hardware. Model licenses vary and are
  the user's responsibility to review when they pull a model.
