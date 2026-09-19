"use strict";

const { createHash } = require("node:crypto");
const { assertRequest, result } = require("./envelope");
const MACHINE = { id: "axm.morphtile.machine.verification", version: "0.1.0" };
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function run(request) {
  assertRequest(request);
  const candidate = request.candidate;
  if (!candidate) return result(request, MACHINE, "HOLD", { holds: [{ code: "HOLD_CANDIDATE_MISSING" }] });
  const errors = [];
  if (candidate.schema !== "morphtile.tile-spec/v0.4") errors.push("schema");
  if (typeof candidate.name !== "string" || !candidate.name) errors.push("name");
  if (!candidate.facets || typeof candidate.facets !== "object") errors.push("facets");
  const receipt = { schema: "axm.morphtile.verification-receipt/v0.1", candidate_sha256: digest(candidate), checks: ["schema", "name", "facets"], morph_tile_runtime_executed: false, visual_observer_executed: false };
  if (errors.length) return result(request, MACHINE, "FAIL", { evidence: [{ kind: "STRUCTURAL", status: "FAIL", errors }, receipt], warnings: [{ code: "RUNTIME_AND_VISUAL_NOT_TESTED" }] });
  return result(request, MACHINE, "PASS", { candidate, evidence: [{ kind: "STRUCTURAL", status: "PASS" }, receipt], warnings: [{ code: "RUNTIME_AND_VISUAL_NOT_TESTED" }] });
}

module.exports = { MACHINE, run };
