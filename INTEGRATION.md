# MorphTile integration

Tested contract target:

- repository: mike-axiom-mir/axm-morphtile
- commit: 13d83a2b2c0d12644442d3d9e45bcbe0af19876a
- format: v0.4
- provisional envelope: v0.1
- fixture set: v0.1

The adapter emits candidate data only. The receiving caller must validate it against the pinned MorphTile runtime, propose it through clone/plan, inspect conflicts and HOLDs, commit only with the applicable authority, preserve the receipt, and retain rollback.

No compatibility is claimed with newer or older MorphTile commits until their conformance tests are run.
