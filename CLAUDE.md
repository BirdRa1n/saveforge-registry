# Instructions for AI agents

Read [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) first. Mandatory rules:

- Profiles, bundles and signatures follow `external/specs` exactly; validate with the specs' schemas and reference path rules, never a local copy.
- Builds are deterministic: dates and sequence numbers come from the pinned upstream commit, not the clock.
- Never commit private signing keys. `--keys test` uses public test keys and is for development only.
- Commit after every meaningful unit of work, grouping only related files, so history stays traceable.
- Commit messages in **English**, Conventional Commits, imperative mood, subject ≤ 72 chars, written like a professional human developer.
- **Never** add `Co-Authored-By: Claude …` or any other AI attribution trailer to commits or pull requests.
- Code and commits in English; talk to the maintainer in Brazilian Portuguese (pt-BR).
