"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function verifySeal(value, field, hashOf) {
  if (!value || typeof value !== "object" || typeof value[field] !== "string") return false;
  const body = clone(value);
  const claimed = body[field];
  delete body[field];
  return claimed === hashOf(body);
}

function isAncestor(generations, target, from) {
  let sha = from;
  const seen = new Set();
  while (sha) {
    if (sha === target) return true;
    if (seen.has(sha)) return false;
    seen.add(sha);
    const generation = generations[sha];
    if (!generation) return false;
    sha = generation.parent_generation_sha256;
  }
  return false;
}

function verifyFlowRuntimeExport(data, runtime) {
  const errors = [];
  const checked = [];
  if (!runtime || typeof runtime.hashOf !== "function") {
    return { status: "FAIL", checked, errors: [failure("RUNTIME_HASH_MISSING", "MorphTile hashOf is required for independent persistent-state verification.")], receipt: null };
  }

  if (!data || typeof data !== "object") {
    return { status: "FAIL", checked, errors: [failure("FLOW_EXPORT_MISSING", "No Flowing runtime export supplied.")], receipt: null };
  }

  if (!verifySeal(data, "runtime_sha256", runtime.hashOf)) {
    errors.push(failure("RUNTIME_SEAL_MISMATCH", "Persistent runtime root hash does not match its canonical body."));
  }
  checked.push("runtime-root-seal");

  const registry = data.registry && typeof data.registry === "object" ? data.registry : {};
  const registryIds = Object.keys(registry).sort();
  if (!registryIds.length) errors.push(failure("REGISTRY_EMPTY", "At least one state contract is required."));
  for (const id of registryIds) {
    const spec = registry[id];
    if (!spec || spec.id !== id) errors.push(failure("REGISTRY_ID_MISMATCH", "Registry key and contract id differ.", { contract: id, actual: spec && spec.id || null }));
    if (!spec || !Array.isArray(spec.depends_on) || !spec.depends_on.length || spec.depends_on.some(v => typeof v !== "string" || !v)) {
      errors.push(failure("REGISTRY_DEPENDS_ON_EMPTY", "Imported contracts must preserve the constructor invariant of one or more non-empty dependency selectors.", { contract: id }));
    }
    if (!spec || !Array.isArray(spec.allowed_routes) || spec.allowed_routes.some(v => typeof v !== "string" || !v)) {
      errors.push(failure("REGISTRY_ALLOWED_ROUTES_INVALID", "allowed_routes must remain an array of non-empty strings.", { contract: id }));
    }
  }
  checked.push("registry-constructor-invariants");

  const generations = data.generations && typeof data.generations === "object" ? data.generations : {};
  const generationIds = Object.keys(generations).sort();
  if (!generationIds.length) errors.push(failure("GENERATIONS_EMPTY", "Persistent runtime must carry at least its base generation."));
  if (!data.current_generation_sha256 || !generations[data.current_generation_sha256]) {
    errors.push(failure("CURRENT_GENERATION_MISSING", "Current generation pointer does not resolve to a stored generation.", { current: data.current_generation_sha256 || null }));
  }

  let baseCount = 0;
  for (const sha of generationIds) {
    const generation = generations[sha];
    if (!generation || generation.generation_sha256 !== sha || !verifySeal(generation, "generation_sha256", runtime.hashOf)) {
      errors.push(failure("GENERATION_SEAL_MISMATCH", "Generation key/body/hash are inconsistent.", { generation: sha }));
      continue;
    }
    if (generation.parent_generation_sha256 === null) {
      baseCount++;
      if (generation.sequence !== 0) errors.push(failure("BASE_SEQUENCE", "Base generation sequence must be 0.", { generation: sha, observed: generation.sequence }));
    } else {
      const parent = generations[generation.parent_generation_sha256];
      if (!parent) {
        errors.push(failure("GENERATION_PARENT_MISSING", "Generation parent is absent.", { generation: sha, parent: generation.parent_generation_sha256 }));
      } else if (generation.sequence !== parent.sequence + 1) {
        errors.push(failure("GENERATION_SEQUENCE_GAP", "Child generation sequence must equal parent sequence + 1.", { generation: sha, parent: generation.parent_generation_sha256, observed: generation.sequence, expected: parent.sequence + 1 }));
      }
    }
    for (const id of registryIds) {
      if (!generation.contracts || !generation.contracts[id]) errors.push(failure("GENERATION_CONTRACT_MISSING", "Generation is missing a registered contract.", { generation: sha, contract: id }));
    }
  }
  if (baseCount !== 1) errors.push(failure("BASE_GENERATION_COUNT", "A valid lineage must have exactly one base generation.", { observed: baseCount }));
  checked.push("generation-lineage");

  const receipts = Array.isArray(data.receipts) ? data.receipts : [];
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];
    if (!verifySeal(receipt, "receipt_sha256", runtime.hashOf)) {
      errors.push(failure("RECEIPT_SEAL_MISMATCH", "Receipt hash does not match its body.", { index: i }));
      continue;
    }
    if (receipt.type === "generation.commit") {
      const generation = generations[receipt.generation_sha256];
      if (!generation) {
        errors.push(failure("COMMIT_RECEIPT_GENERATION_UNKNOWN", "Commit receipt references a generation not present in the exported lineage.", { index: i, generation: receipt.generation_sha256 || null }));
        continue;
      }
      if (receipt.sequence !== generation.sequence || receipt.parent_generation_sha256 !== generation.parent_generation_sha256 || receipt.plan_sha256 !== generation.plan_sha256) {
        errors.push(failure("COMMIT_RECEIPT_GENERATION_MISMATCH", "Commit receipt does not describe the referenced generation exactly.", { index: i, generation: receipt.generation_sha256 }));
      }
    } else if (receipt.type === "generation.rollback") {
      const from = generations[receipt.from_generation_sha256];
      const to = generations[receipt.to_generation_sha256];
      if (!from || !to) errors.push(failure("ROLLBACK_RECEIPT_GENERATION_UNKNOWN", "Rollback receipt references an unknown generation.", { index: i }));
      else {
        if (!isAncestor(generations, receipt.to_generation_sha256, receipt.from_generation_sha256)) errors.push(failure("ROLLBACK_RECEIPT_NOT_ANCESTOR", "Rollback receipt target is not an ancestor of its source.", { index: i }));
        if (receipt.to_sequence !== to.sequence) errors.push(failure("ROLLBACK_RECEIPT_SEQUENCE_MISMATCH", "Rollback receipt to_sequence does not match target generation.", { index: i, observed: receipt.to_sequence, expected: to.sequence }));
      }
    } else if (receipt.type === "generation.reactivate") {
      const from = generations[receipt.from_generation_sha256];
      const to = generations[receipt.to_generation_sha256];
      if (!from || !to) errors.push(failure("REACTIVATE_RECEIPT_GENERATION_UNKNOWN", "Reactivate receipt references an unknown generation.", { index: i }));
      else {
        if (!isAncestor(generations, receipt.from_generation_sha256, receipt.to_generation_sha256)) errors.push(failure("REACTIVATE_RECEIPT_NOT_DESCENDANT", "Reactivate receipt target is not a descendant of its source.", { index: i }));
        if (receipt.to_sequence !== to.sequence) errors.push(failure("REACTIVATE_RECEIPT_SEQUENCE_MISMATCH", "Reactivate receipt to_sequence does not match target generation.", { index: i, observed: receipt.to_sequence, expected: to.sequence }));
      }
    } else {
      errors.push(failure("RECEIPT_TYPE_UNKNOWN", "Persistent runtime contains an unknown receipt type.", { index: i, type: receipt && receipt.type || null }));
    }
  }
  checked.push("receipt-semantic-linkage");

  const receipt = {
    schema: "axm.morphtile.flow-runtime-conformance-receipt/v0.1",
    runtime_sha256: data.runtime_sha256 || null,
    registry_contracts: registryIds.length,
    generations: generationIds.length,
    receipts: receipts.length,
    current_generation_sha256: data.current_generation_sha256 || null
  };
  return { status: errors.length ? "FAIL" : "PASS", checked, errors, receipt };
}

module.exports = { verifyFlowRuntimeExport };
