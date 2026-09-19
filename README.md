# MorphTile Verification Machine

Challenges candidate MorphTile matter. The foundation verifies a minimal tile-spec structure and emits a digest-bearing receipt.

## Boundary answers

1. **What it does:** Challenges candidate MorphTile matter. The foundation verifies a minimal tile-spec structure and emits a digest-bearing receipt.
2. **What it does not own:** Silent repair, automatic aesthetic judgment, canon, or redefining a failure as success.
3. **What it accepts:** axm.morphtile.verification-request/v0.1 with an inspectable candidate.
4. **What it produces:** PASS, HOLD, or FAIL plus axm.morphtile.verification-receipt/v0.1 evidence.
5. **MorphTile interaction:** output goes through MorphTile's public contracts and clone → plan → commit → receipt → rollback path. MorphTile does not depend on this repository.
6. **Evidence:** Known-good, intentionally broken, and missing-candidate fixtures.
7. **When it cannot satisfy a request:** Missing candidates HOLD; structural errors FAIL with exact field names.

## Run

    npm test

Node 18 or later; zero runtime dependencies; no secrets or network required.

## Truth boundary

- IMPLEMENTED: the tiny adapter and local envelope used by the fixtures.
- TESTED: the claims named by the local test files.
- EXPERIMENTAL: envelope v0.1 and every candidate schema in this foundation.
- NOT TESTED: compatibility beyond MorphTile commit 13d83a2b2c0d12644442d3d9e45bcbe0af19876a.
- HELD: Current PASS is structural only; no runtime, portability, performance, or visual claim.

This is a foundation, not evidence that MorphTile can autonomously manufacture MorphTile.
