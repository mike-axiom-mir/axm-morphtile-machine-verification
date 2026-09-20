"use strict";

function failure(code, detail, observed = {}) {
  if (typeof code !== "string" || code.length === 0) {
    throw new TypeError("verification failure code must be a non-empty string");
  }
  if (typeof detail !== "string" || detail.length === 0) {
    throw new TypeError("verification failure detail must be a non-empty string");
  }
  const metadata = observed && typeof observed === "object" && !Array.isArray(observed) ? observed : {};
  return { ...metadata, code, detail };
}

module.exports = { failure };
