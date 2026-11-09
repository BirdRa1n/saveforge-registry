# saveforge-registry

Source of the game profiles used by SaveForge, and the tools that publish them as **signed, static bundles** ([spec](external/specs/registry/SPEC.md)).

| Channel | Content | Status |
|---|---|---|
| `upstream-ludusavi` | The [Ludusavi Manifest](https://github.com/mtkennerly/ludusavi-manifest), converted to [profile v1](external/specs/profile/SPEC.md) | Working (local builds) |
| `official` | Profiles reviewed by SaveForge maintainers (`profiles/`) | Empty for now |

## Layout

```
profiles/                 official profiles (YAML), one folder per game — empty for now
upstream/ludusavi.lock.json  pinned Ludusavi commit + SHA-256 of its manifest
tools/                    Node.js tooling (no build step)
  fetch-upstream.mjs      downloads the pinned manifest into .cache/ and verifies it
  build.mjs               converts, validates, bundles and signs into dist/v1/
  lib/                    converter, validator, bundle writer, signing keys
  test/                   node:test suites
external/specs/           saveforge-specs submodule (schemas, path rules, test keys)
```

`dist/` and `.cache/` are build outputs and are not committed.

## Building locally

Requires Node.js 22.15 or newer (built-in zstd).

```bash
git submodule update --init
```

```bash
npm ci
```

```bash
npm run fetch-upstream
```

```bash
npm run build -- --keys test
```

The build writes `dist/v1/` (root, channel index, bundle and signatures) and prints a conversion report: how many Ludusavi entries became profiles and why the rest were skipped.

### Signing keys

`--keys test` signs with the **public test keys** of `saveforge-specs` (`registry/test-vectors/signing.json`). Their private seeds are public, so these bundles prove the pipeline works but must never be trusted by a release build. Production keys (an offline root key and a CI-held online key) are not set up yet; that requires a decision on where they are kept.

## Data licenses

- Tools and code in this repository: [MIT](LICENSE).
- `upstream-ludusavi` channel: CC BY-NC-SA 3.0 (data from PCGamingWiki via the Ludusavi Manifest). Attribution is embedded in every bundle as a notice that clients display.
- Official profiles: license to be decided before the first official profile is published.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
