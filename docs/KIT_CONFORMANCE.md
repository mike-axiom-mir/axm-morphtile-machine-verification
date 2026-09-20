# MorphTile kit conformance verification

This lane verifies portable MorphTile kit candidates independently of the machine that produced them.

## Why this exists

A producer saying that it computed a kit hash and successfully called `importKit` is useful producer evidence, but it is not independent verification. Verification must recompute the claim from the candidate that actually crossed the boundary.

`src/kit-conformance.js` therefore treats the kit as untrusted input and checks it against an explicitly supplied MorphTile runtime.

## Checks

For a complete kit candidate the verifier:

1. checks the kit envelope;
2. recomputes `hashOf({ tile, defs, words })` and compares it with `kit.expect.sha256`;
3. checks declared definition/word counts and refuses a non-empty `expect.missing` list;
4. validates the carried tile with the supplied runtime;
5. asks a fresh receiver to analyze the kit and requires `READY` plus `verified_payload_sha256` evidence;
6. proves that import analysis did not mutate that receiver;
7. changes semantic tile content without changing the advertised hash and requires `HOLD_HASH_MISMATCH`;
8. proves that rejected tampering did not mutate the receiver.

The resulting `axm.morphtile.kit-conformance-receipt/v0.1` records the observed payload identity and the two import/tamper outcomes.

## Pinned external candidate

The integration lane deliberately verifies a fixed sibling candidate rather than whatever happens to be at a branch tip:

- Assembly Machine head: `0ae941c3ebc2293bbe974a309bdd27a97b4f3fd0`
- Assembly runtime target: MorphTile `13d83a2b2c0d12644442d3d9e45bcbe0af19876a`

It additionally checks Assembly's fail-closed rule that arbitrary dependency closure cannot be silently discarded when the current kit contract cannot represent it.

The earlier hash-portability lane remains pinned separately to MorphTile `4346df01ed18cd1336064f9323d7766ff4f6338a`. The two runtime pins are intentionally separate because they prove different claims.

## Placement

This belongs in **Verification Machine**, not MorphTile core.

MorphTile already owns the kit format, hash contract and import behavior. The missing reusable capability is an independent adversarial verifier that can inspect producer outputs and emit a receipt.

## Truth boundary

A PASS means the named candidate satisfied these checks against the exact pinned runtime in the evidence.

It does not claim:

- compatibility with current/future MorphTile main;
- transport of arbitrary external dependencies;
- every possible kit corruption case;
- browser or non-JavaScript portability;
- visual correctness;
- production performance;
- automatic merge or CANON authority.

A producer PASS is never substituted for this verifier's own result.
