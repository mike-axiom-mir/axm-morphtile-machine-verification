# Status

- Foundation version: 0.1.0
- State: TESTED FOUNDATION
- Local tests: npm test
- MorphTile structural target: v0.4 at 13d83a2b2c0d12644442d3d9e45bcbe0af19876a
- Hash-conformance reference: v0.4 at 4346df01ed18cd1336064f9323d7766ff4f6338a
- Envelope: provisional v0.1
- Visual proof: none

## Implemented and tested

Known-good, intentionally broken, and missing-candidate fixtures.

Canonical candidate hashes use sorted-key canonical JSON. Fixed canonical-string/SHA-256 vectors are checked deterministically. CI additionally checks MorphTile core's independent `canonical` / `hashOf` implementation against the same vector set and the known-good candidate at the exact hash-conformance reference commit.

## HELD / open

Candidate PASS is still structural only. Runtime execution, replay, rollback, performance, and visual claims remain held.

Hash portability is proven only for the fixed vectors and known-good candidate under Node using two implementations. Browser execution, other languages/runtimes, additional numeric edge cases, and future MorphTile commits remain held.

No claim of autonomous creation, production readiness, canon, or visual quality is made.
