# MorphTile Verification Machine

Challenges candidate MorphTile matter. The foundation verifies a minimal tile-spec structure and emits a digest-bearing receipt.

## Boundary answers

1. **What it does:** Challenges candidate MorphTile matter. The foundation verifies a minimal tile-spec structure and emits a digest-bearing receipt.
2. **What it does not own:** Silent repair, automatic aesthetic judgment, canon, or redefining a failure as success.
3. **What it accepts:** axm.morphtile.verification-request/v0.1 with an inspectable candidate.
4. **What it produces:** PASS, HOLD, or FAIL plus axm.morphtile.verification-receipt/v0.1 evidence.
5. **MorphTile interaction:** output goes through MorphTile's public contracts and clone → plan → commit → receipt → rollback path. MorphTile does not depend on this repository.
6. **Evidence:** Known-good, intentionally broken, missing-candidate, canonical-hash, and pinned-core conformance fixtures/tests.
7. **When it cannot satisfy a request:** Missing candidates HOLD; structural errors FAIL with exact field names.

## Run

    npm test

Node 18 or later; zero runtime dependencies; no secrets or runtime network required.

## Canonical hash conformance

`fixtures/canonical-hash-vectors.json` is a language-neutral fixed-vector contract for `canonical-json-sorted-keys/v1+sha256-utf8`.

The deterministic conformance checker in `src/hash-conformance.js` tests both canonical bytes and SHA-256 outputs. GitHub Actions checks the Verification Machine implementation and the independent MorphTile core `canonical` / `hashOf` implementation against the same vectors at the exact pinned MorphTile commit named by the fixture.

This proves agreement for the named vectors and the known-good candidate under Node. It does not prove every browser, language runtime, numeric edge case, or future MorphTile commit.

## Truth boundary

- IMPLEMENTED: the tiny adapter, canonical candidate digest, fixed portable hash vectors, and deterministic hash-conformance checker.
- TESTED: the claims named by the local test files; CI additionally checks the pinned MorphTile core hash implementation against the fixed vectors.
- EXPERIMENTAL: envelope v0.1 and every candidate schema in this foundation.
- NOT TESTED: full compatibility beyond MorphTile commit 13d83a2b2c0d12644442d3d9e45bcbe0af19876a; the hash-only conformance lane separately pins MorphTile commit 4346df01ed18cd1336064f9323d7766ff4f6338a.
- HELD: Current candidate PASS is structural only; no runtime execution, replay, rollback, performance, visual quality, browser portability, or non-JavaScript runtime claim.

This is a foundation, not evidence that MorphTile can autonomously manufacture MorphTile.
