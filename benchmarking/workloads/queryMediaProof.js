'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// Read-path throughput/latency: GetMediaProof is evaluate-only (no
// endorsement/ordering/commit involved), so this isolates query performance
// from the write path measured by the register* workloads.
const QUERY_TARGET_ID = 'caliper-query-target';

class QueryMediaProofWorkload extends WorkloadModuleBase {
  async submitTransaction() {
    const args = {
      contractId: 'truststreamcc',
      contractFunction: 'GetMediaProof',
      contractArguments: ['image', QUERY_TARGET_ID],
      timeout: 30,
      readOnly: true,
    };

    await this.sutAdapter.sendRequests(args);
  }
}

function createWorkloadModule() {
  return new QueryMediaProofWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
