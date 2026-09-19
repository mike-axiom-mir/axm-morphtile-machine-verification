"use strict";

const ENVELOPE_VERSION = "0.1";
const STATUSES = new Set(["CANDIDATE", "PASS", "HOLD", "FAIL"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("request must be an object");
  if (request.envelope_version !== ENVELOPE_VERSION) throw new Error("unsupported envelope_version");
  if (typeof request.request_id !== "string" || !request.request_id) throw new Error("request_id is required");
  if (typeof request.goal !== "string" || !request.goal) throw new Error("goal is required");
  return request;
}

function result(request, machine, status, fields = {}) {
  assertRequest(request);
  if (!STATUSES.has(status)) throw new Error("invalid result status");
  return {
    envelope_version: ENVELOPE_VERSION,
    request_id: request.request_id,
    machine: clone(machine),
    status,
    candidate: fields.candidate === undefined ? null : clone(fields.candidate),
    dependencies: clone(fields.dependencies || []),
    evidence: clone(fields.evidence || []),
    warnings: clone(fields.warnings || []),
    holds: clone(fields.holds || []),
    provenance: clone(fields.provenance || request.provenance || {}),
    suggested_missing_capability: fields.suggested_missing_capability || null
  };
}

module.exports = { ENVELOPE_VERSION, STATUSES, clone, assertRequest, result };
