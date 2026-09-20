"use strict";

const {
  verifyInterfaceProxyAndReceiverBoundary
} = require("./source-interception-round3-conformance");

function failure(code, detail, extra = {}) {
  return { code, detail, ...extra };
}

function clonePortable(value) {
  return JSON.parse(JSON.stringify(value));
}

function capture(fn) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return {
      value: null,
      error: {
        name: error && error.name ? error.name : "Error",
        code: error && error.code ? error.code : null,
        message: error && error.message ? error.message : String(error)
      }
    };
  }
}

function trappingProxy(target, counter) {
  return new Proxy(target, {
    getPrototypeOf(value) {
      counter.calls += 1;
      return Reflect.getPrototypeOf(value);
    },
    ownKeys(value) {
      counter.calls += 1;
      return Reflect.ownKeys(value);
    },
    getOwnPropertyDescriptor(value, key) {
      counter.calls += 1;
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
    get(value, key, receiver) {
      counter.calls += 1;
      return Reflect.get(value, key, receiver);
    }
  });
}

function isExpectedEnvelopeReject(observed) {
  return Boolean(
    observed
    && observed.value === null
    && observed.error
    && observed.error.code === "INTERFACE_ENVELOPE_NONPORTABLE_VALUE"
  );
}

function verifyInterfaceEnvelopeAndReceiver(interfaceMachine, assemblyReceiver, fixture, options = {}) {
  const interfaceCommit = options.interfaceCommit || null;
  const assemblyCommit = options.assemblyCommit || null;
  const errors = [];
  const checked = [];

  if (!interfaceCommit || !assemblyCommit || !fixture
      || !interfaceMachine || typeof interfaceMachine.run !== "function"
      || !assemblyReceiver || typeof assemblyReceiver.run !== "function") {
    return {
      status: "FAIL",
      errors: [failure(
        "INTERFACE_R4_CONTRACT_MISSING",
        "Exact Interface/Assembly revisions, a portable fixture, and both run() contracts are required."
      )],
      checked,
      receipt: null
    };
  }

  const rootCounter = { calls: 0 };
  const rootProxy = trappingProxy(clonePortable(fixture), rootCounter);
  const rootObserved = capture(() => interfaceMachine.run(rootProxy));
  const rootPass = isExpectedEnvelopeReject(rootObserved) && rootCounter.calls === 0;
  if (!rootPass) {
    errors.push(failure(
      "INTERFACE_ROOT_PROXY_SOURCE_EXECUTION",
      "Root Interface envelope Proxy did not fail closed before caller traps could execute.",
      { trap_calls: rootCounter.calls, error: rootObserved.error }
    ));
  }
  checked.push("interface-root-envelope-proxy-safe");

  const revokedRoot = Proxy.revocable(clonePortable(fixture), {});
  revokedRoot.revoke();
  const revokedRootObserved = capture(() => interfaceMachine.run(revokedRoot.proxy));
  const revokedRootPass = isExpectedEnvelopeReject(revokedRootObserved);
  if (!revokedRootPass) {
    errors.push(failure(
      "INTERFACE_REVOKED_ROOT_PROXY_NOT_FAIL_CLOSED",
      "Revoked root Interface envelope escaped the explicit portable-source rejection boundary.",
      { error: revokedRootObserved.error }
    ));
  }
  checked.push("interface-revoked-root-proxy-safe");

  const accessorRequest = clonePortable(fixture);
  let requestIdCalls = 0;
  const originalRequestId = accessorRequest.request_id;
  delete accessorRequest.request_id;
  Object.defineProperty(accessorRequest, "request_id", {
    enumerable: true,
    configurable: true,
    get() {
      requestIdCalls += 1;
      return originalRequestId;
    }
  });
  const requestIdBefore = Object.getOwnPropertyDescriptor(accessorRequest, "request_id");
  const accessorObserved = capture(() => interfaceMachine.run(accessorRequest));
  const requestIdAfter = Object.getOwnPropertyDescriptor(accessorRequest, "request_id");
  const accessorPass = isExpectedEnvelopeReject(accessorObserved)
    && requestIdCalls === 0
    && requestIdBefore
    && requestIdAfter
    && requestIdBefore.get === requestIdAfter.get;
  if (!accessorPass) {
    errors.push(failure(
      "INTERFACE_REQUIRED_FIELD_ACCESSOR_EXECUTED",
      "Required Interface envelope field accessor executed or was not rejected source-safely.",
      { calls: requestIdCalls, error: accessorObserved.error }
    ));
  }
  checked.push("interface-required-envelope-field-descriptor-safe");

  const provenanceAccessorRequest = clonePortable(fixture);
  let provenanceAccessorCalls = 0;
  Object.defineProperty(provenanceAccessorRequest.provenance, "caller", {
    enumerable: true,
    configurable: true,
    get() {
      provenanceAccessorCalls += 1;
      return "rewritten-caller";
    }
  });
  const provenanceAccessorObserved = capture(() => interfaceMachine.run(provenanceAccessorRequest));
  const provenanceAccessorPass = isExpectedEnvelopeReject(provenanceAccessorObserved)
    && provenanceAccessorCalls === 0;
  if (!provenanceAccessorPass) {
    errors.push(failure(
      "INTERFACE_PROVENANCE_ACCESSOR_EXECUTED",
      "Interface provenance accessor executed or was not rejected source-safely.",
      { calls: provenanceAccessorCalls, error: provenanceAccessorObserved.error }
    ));
  }
  checked.push("interface-provenance-accessor-safe");

  const provenanceProxyRequest = clonePortable(fixture);
  const provenanceProxyCounter = { calls: 0 };
  provenanceProxyRequest.provenance = trappingProxy(
    clonePortable(provenanceProxyRequest.provenance),
    provenanceProxyCounter
  );
  const provenanceProxyObserved = capture(() => interfaceMachine.run(provenanceProxyRequest));
  const provenanceProxyPass = isExpectedEnvelopeReject(provenanceProxyObserved)
    && provenanceProxyCounter.calls === 0;
  if (!provenanceProxyPass) {
    errors.push(failure(
      "INTERFACE_PROVENANCE_PROXY_TRAP_EXECUTED",
      "Interface provenance Proxy executed caller traps or escaped portable-source rejection.",
      { trap_calls: provenanceProxyCounter.calls, error: provenanceProxyObserved.error }
    ));
  }
  checked.push("interface-provenance-proxy-safe");

  const revokedProvenanceRequest = clonePortable(fixture);
  const revokedProvenance = Proxy.revocable(
    clonePortable(revokedProvenanceRequest.provenance),
    {}
  );
  revokedProvenance.revoke();
  revokedProvenanceRequest.provenance = revokedProvenance.proxy;
  const revokedProvenanceObserved = capture(() => interfaceMachine.run(revokedProvenanceRequest));
  const revokedProvenancePass = isExpectedEnvelopeReject(revokedProvenanceObserved);
  if (!revokedProvenancePass) {
    errors.push(failure(
      "INTERFACE_REVOKED_PROVENANCE_PROXY_NOT_FAIL_CLOSED",
      "Revoked provenance Proxy escaped the explicit portable-source rejection boundary.",
      { error: revokedProvenanceObserved.error }
    ));
  }
  checked.push("interface-revoked-provenance-proxy-safe");

  const toJsonRequest = clonePortable(fixture);
  let toJsonCalls = 0;
  Object.defineProperty(toJsonRequest.provenance, "toJSON", {
    enumerable: false,
    configurable: true,
    value() {
      toJsonCalls += 1;
      return { caller: "rewritten-caller" };
    }
  });
  const toJsonObserved = capture(() => interfaceMachine.run(toJsonRequest));
  const toJsonPass = isExpectedEnvelopeReject(toJsonObserved) && toJsonCalls === 0;
  if (!toJsonPass) {
    errors.push(failure(
      "INTERFACE_PROVENANCE_TOJSON_EXECUTED",
      "Hidden provenance toJSON hook executed or was not rejected before transport.",
      { calls: toJsonCalls, error: toJsonObserved.error }
    ));
  }
  checked.push("interface-provenance-tojson-safe");

  const portableRequest = clonePortable(fixture);
  const portableBefore = JSON.stringify(portableRequest);
  const portableObserved = capture(() => interfaceMachine.run(portableRequest));
  const portableOut = portableObserved.value;
  const portablePass = !portableObserved.error
    && portableOut
    && portableOut.status === "CANDIDATE"
    && JSON.stringify(portableRequest) === portableBefore
    && JSON.stringify(portableOut.provenance) === JSON.stringify(fixture.provenance)
    && Object.getPrototypeOf(portableOut.provenance) === Object.prototype;
  if (!portablePass) {
    errors.push(failure(
      "INTERFACE_PORTABLE_ENVELOPE_CONTROL_FAILED",
      "Ordinary portable Interface envelope/provenance did not remain source-preserving.",
      {
        status: portableOut && portableOut.status || null,
        error: portableObserved.error,
        source_preserved: JSON.stringify(portableRequest) === portableBefore
      }
    ));
  }
  checked.push("interface-portable-envelope-control");

  const receiverResult = verifyInterfaceProxyAndReceiverBoundary(interfaceMachine, assemblyReceiver, {
    interfaceCommit,
    assemblyCommit
  });
  const receiverPass = receiverResult && receiverResult.status === "PASS";
  if (!receiverPass) {
    errors.push(failure(
      "INTERFACE_CURRENT_ASSEMBLY_RECEIVER_REGRESSION",
      "Current Interface candidate no longer preserves prior authored-intent/proof identity through the current Assembly receiver.",
      { receiver_errors: receiverResult && receiverResult.errors || null }
    ));
  }
  checked.push("interface-current-assembly-proof-retention");

  return {
    status: errors.length ? "FAIL" : "PASS",
    errors,
    checked,
    receipt: {
      schema: "axm.morphtile.interface-envelope-source-integrity/v0.1",
      interface_commit: interfaceCommit,
      assembly_commit: assemblyCommit,
      root_proxy: {
        trap_calls: rootCounter.calls,
        error_code: rootObserved.error && rootObserved.error.code || null,
        pass: rootPass
      },
      revoked_root_proxy: {
        error_code: revokedRootObserved.error && revokedRootObserved.error.code || null,
        error_message: revokedRootObserved.error && revokedRootObserved.error.message || null,
        pass: revokedRootPass
      },
      request_id_accessor: {
        calls: requestIdCalls,
        error_code: accessorObserved.error && accessorObserved.error.code || null,
        descriptor_preserved: Boolean(requestIdBefore && requestIdAfter && requestIdBefore.get === requestIdAfter.get),
        pass: accessorPass
      },
      provenance_accessor: {
        calls: provenanceAccessorCalls,
        error_code: provenanceAccessorObserved.error && provenanceAccessorObserved.error.code || null,
        pass: provenanceAccessorPass
      },
      provenance_proxy: {
        trap_calls: provenanceProxyCounter.calls,
        error_code: provenanceProxyObserved.error && provenanceProxyObserved.error.code || null,
        pass: provenanceProxyPass
      },
      revoked_provenance_proxy: {
        error_code: revokedProvenanceObserved.error && revokedProvenanceObserved.error.code || null,
        error_message: revokedProvenanceObserved.error && revokedProvenanceObserved.error.message || null,
        pass: revokedProvenancePass
      },
      provenance_tojson: {
        calls: toJsonCalls,
        error_code: toJsonObserved.error && toJsonObserved.error.code || null,
        pass: toJsonPass
      },
      portable_control: {
        status: portableOut && portableOut.status || null,
        source_preserved: JSON.stringify(portableRequest) === portableBefore,
        provenance_preserved: portableOut ? JSON.stringify(portableOut.provenance) === JSON.stringify(fixture.provenance) : false,
        normal_prototype: Boolean(portableOut && portableOut.provenance && Object.getPrototypeOf(portableOut.provenance) === Object.prototype),
        pass: portablePass
      },
      receiver_regression: receiverResult && receiverResult.receipt || null
    }
  };
}

module.exports = {
  verifyInterfaceEnvelopeAndReceiver
};