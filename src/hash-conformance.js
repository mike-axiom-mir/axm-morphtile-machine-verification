"use strict";

function verifyHashVectors(document, implementation) {
  const errors = [];
  const vectors = document && Array.isArray(document.vectors) ? document.vectors : null;
  if (!document || document.schema !== "axm.morphtile.canonical-hash-vectors/v0.1") {
    errors.push({ code: "VECTOR_SCHEMA", expected: "axm.morphtile.canonical-hash-vectors/v0.1", actual: document && document.schema });
  }
  if (!document || document.profile !== "canonical-json-sorted-keys/v1+sha256-utf8") {
    errors.push({ code: "VECTOR_PROFILE", expected: "canonical-json-sorted-keys/v1+sha256-utf8", actual: document && document.profile });
  }
  if (!vectors || !vectors.length) errors.push({ code: "VECTOR_SET_EMPTY" });
  if (!implementation || typeof implementation.canonicalize !== "function" || typeof implementation.digest !== "function") {
    errors.push({ code: "IMPLEMENTATION_MISSING" });
    return { status: "FAIL", checked: 0, errors };
  }

  let checked = 0;
  for (const vector of vectors || []) {
    const id = vector && vector.id ? vector.id : `vector-${checked + 1}`;
    const canonical = implementation.canonicalize(vector.value);
    const digest = implementation.digest(vector.value);
    if (canonical !== vector.canonical_utf8) {
      errors.push({ code: "CANONICAL_MISMATCH", id, expected: vector.canonical_utf8, actual: canonical });
    }
    if (digest !== vector.sha256) {
      errors.push({ code: "SHA256_MISMATCH", id, expected: vector.sha256, actual: digest });
    }
    checked++;
  }

  return {
    status: errors.length ? "FAIL" : "PASS",
    profile: document && document.profile,
    checked,
    errors
  };
}

module.exports = { verifyHashVectors };
