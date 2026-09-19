# Provisional machine envelope v0.1

This repository copies the intentionally small provisional envelope locally. It is not a shared package and does not justify an eighth protocol repository yet.

Requests carry `envelope_version`, `request_id`, `goal`, and may carry `intent`, inputs or references, constraints, available capabilities, budget, and provenance.

Results carry the same request id, machine id/version, one of `CANDIDATE`, `PASS`, `HOLD`, or `FAIL`, candidate data, dependencies, evidence, warnings, HOLDs, provenance, and an optional suggested missing capability.

A candidate is never canonical merely because a machine returned it. A receiving MorphTile workspace still owns clone → plan → commit → receipt → rollback.
