"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function kitPayload(kit) {
  return {
    tile: clone(kit.tile),
    defs: clone(kit.defs || {}),
    words: clone(kit.words || {})
  };
}

function verifyKitCandidate(input, runtime) {
  const wrapper = input && input.status === "CANDIDATE" && input.kit ? input : null;
  const kit = wrapper ? input.kit : input;
  const errors = [];
  const requiredRuntime = ["hashOf", "createWorld", "validateTile", "importKit"];
  const missingRuntime = requiredRuntime.filter(name => !runtime || typeof runtime[name] !== "function");

  if (missingRuntime.length) {
    return {
      status: "FAIL",
      checked: [],
      errors: [failure("RUNTIME_CONTRACT_MISSING", "Verification requires the public MorphTile kit verification contract.", { missing_functions: missingRuntime })],
      receipt: null
    };
  }

  if (!kit || typeof kit !== "object") {
    return {
      status: "FAIL",
      checked: [],
      errors: [failure("KIT_MISSING", "No kit object was supplied.")],
      receipt: null
    };
  }

  if (kit.format !== "morphtile-kit") errors.push(failure("KIT_FORMAT", "format must be morphtile-kit", { actual: kit.format || null }));
  if (!kit.tile || typeof kit.tile !== "object") errors.push(failure("KIT_TILE_MISSING", "kit.tile must be an object"));
  if (!kit.expect || typeof kit.expect !== "object") errors.push(failure("KIT_EXPECT_MISSING", "kit.expect must be an object"));
  if (errors.length) return { status: "FAIL", checked: ["envelope"], errors, receipt: null };

  const payload = kitPayload(kit);
  const observedHash = runtime.hashOf(payload);
  const expectedHash = kit.expect.sha256 || null;
  if (typeof expectedHash !== "string" || !expectedHash) {
    errors.push(failure("KIT_EXPECT_SHA256_MISSING", "kit.expect.sha256 must be a non-empty string"));
  } else if (observedHash !== expectedHash) {
    errors.push(failure("KIT_HASH_MISMATCH", "The advertised payload hash does not match tile + defs + words.", { expected: expectedHash, observed: observedHash }));
  }

  const defsCount = Object.keys(payload.defs).length;
  const wordsCount = Object.keys(payload.words).length;
  if (kit.expect.defs !== defsCount) errors.push(failure("KIT_EXPECT_DEFS_COUNT", "kit.expect.defs does not match the carried definition count.", { expected: kit.expect.defs, observed: defsCount }));
  if (kit.expect.words !== wordsCount) errors.push(failure("KIT_EXPECT_WORDS_COUNT", "kit.expect.words does not match the carried word count.", { expected: kit.expect.words, observed: wordsCount }));
  if (!Array.isArray(kit.expect.missing)) errors.push(failure("KIT_EXPECT_MISSING_LIST", "kit.expect.missing must be an array."));
  else if (kit.expect.missing.length) errors.push(failure("KIT_EXPECT_INCOMPLETE", "A verification PASS requires a complete kit with no advertised missing closure.", { missing: clone(kit.expect.missing) }));

  const tileValidation = runtime.validateTile(payload.tile);
  if (!tileValidation || !tileValidation.ok) {
    errors.push(failure("KIT_TILE_INVALID", "The carried tile does not satisfy the supplied MorphTile runtime.", { errors: clone((tileValidation && tileValidation.errors) || []) }));
  }

  const receiver = runtime.createWorld("Verification kit receiver");
  const receiverBefore = runtime.hashOf(receiver);
  const imported = runtime.importKit(receiver, clone(kit));
  const receiverAfter = runtime.hashOf(receiver);
  if (receiverAfter !== receiverBefore) {
    errors.push(failure("IMPORT_ANALYSIS_MUTATED_RECEIVER", "importKit changed the receiver while only analyzing/staging the kit.", { before: receiverBefore, after: receiverAfter }));
  }
  if (!imported || imported.status !== "READY") {
    errors.push(failure("KIT_IMPORT_NOT_READY", "A fresh receiver did not accept the kit as READY.", { actual: imported && imported.status ? imported.status : null }));
  }
  if (!imported || imported.evidence !== "verified_payload_sha256") {
    errors.push(failure("KIT_IMPORT_EVIDENCE", "Fresh-world acceptance did not carry verified_payload_sha256 evidence.", { actual: imported && imported.evidence ? imported.evidence : null }));
  }

  const tampered = clone(kit);
  tampered.tile = clone(tampered.tile);
  tampered.tile.name = String(tampered.tile.name || "Untitled tile") + " [verification tamper]";
  const tamperReceiver = runtime.createWorld("Verification tamper receiver");
  const tamperBefore = runtime.hashOf(tamperReceiver);
  const tamperResult = runtime.importKit(tamperReceiver, tampered);
  const tamperAfter = runtime.hashOf(tamperReceiver);
  if (!tamperResult || tamperResult.status !== "HOLD_HASH_MISMATCH") {
    errors.push(failure("TAMPER_NOT_REJECTED", "Semantic tile tampering was not rejected as HOLD_HASH_MISMATCH.", { actual: tamperResult && tamperResult.status ? tamperResult.status : null }));
  }
  if (tamperAfter !== tamperBefore) {
    errors.push(failure("TAMPER_ANALYSIS_MUTATED_RECEIVER", "Rejected tampering changed the receiver state.", { before: tamperBefore, after: tamperAfter }));
  }

  const receipt = {
    schema: "axm.morphtile.kit-conformance-receipt/v0.1",
    runtime_version: runtime.VERSION || null,
    source_closure_hash: wrapper && wrapper.source_closure_hash ? wrapper.source_closure_hash : null,
    expected_payload_sha256: expectedHash,
    observed_payload_sha256: observedHash,
    defs: defsCount,
    words: wordsCount,
    fresh_import_status: imported && imported.status ? imported.status : null,
    fresh_import_evidence: imported && imported.evidence ? imported.evidence : null,
    import_analysis_mutated_receiver: receiverAfter !== receiverBefore,
    tamper_status: tamperResult && tamperResult.status ? tamperResult.status : null,
    tamper_analysis_mutated_receiver: tamperAfter !== tamperBefore
  };

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked: [
      "envelope",
      "payload-hash",
      "closure-counts",
      "tile-validation",
      "fresh-import-ready",
      "fresh-import-evidence",
      "import-analysis-no-mutation",
      "semantic-tamper-rejection",
      "tamper-analysis-no-mutation"
    ],
    errors,
    receipt
  };
}

module.exports = { kitPayload, verifyKitCandidate };
