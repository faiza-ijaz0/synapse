# SYNAPSE

A local-first **Engineering Intelligence Platform**: codebase analysis, API
testing, website quality audits, test-result intelligence, and historical
reports, all running on your own machine with free and open-source tools.
Optional local AI explanations are available but never required.

> **Status: Phase 2 (foundation) in progress.** Phase 1 architecture approved 2026-10-28.

## Documentation

| Doc                                                                  | Contents                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| [01 Product requirements](docs/01-product-requirements.md)           | Goals, non-goals, functional/non-functional requirements      |
| [02 Architecture](docs/02-architecture.md)                           | Web, API, DB, worker, egress guard, CLI, optional AI          |
| [03 Threat model](docs/03-threat-model.md)                           | Assets, trust boundaries, threats, mitigations, residual risk |
| [04 Roadmap](docs/04-roadmap.md)                                     | Phases 1–9 with exit criteria                                 |
| [05 Repository structure](docs/05-repository-structure.md)           | Monorepo layout and dependency rules                          |
| [06 Dependencies & licensing](docs/06-dependencies-and-licensing.md) | Verified licenses and versions                                |
| [07 Environment variables](docs/07-environment-variables.md)         | Every variable, defaults, secrets handling                    |
| [08 Testing strategy](docs/08-testing-strategy.md)                   | Test layers, SSRF corpus, CI                                  |
| [09 Local development](docs/09-local-development.md)                 | Windows setup for Postgres, queue, env                        |
| [ADRs](docs/adr/README.md)                                           | Architecture decision records                                 |

## Principles

Local-first · no paid services · real findings only · untrusted inputs
treated as untrusted · AI optional and advisory.

## License

SYNAPSE is released under the [MIT License](LICENSE). Third-party dependencies
keep their own licenses. See [doc 06](docs/06-dependencies-and-licensing.md) and
[ADR-0013](docs/adr/0013-mit-license.md).
