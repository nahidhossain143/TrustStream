'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// Registers exactly one fixed-ID image proof so the query round below has a
// known, stable target to read repeatedly. Must run as its own round with
// txNumber: 1 and workers.number: 1 -- RegisterImageProof rejects a second
// call with the same ID.
const QUERY_TARGET_ID = 'caliper-query-target';

class SeedQueryTargetWorkload extends WorkloadModuleBase {
  async submitTransaction() {
    const args = {
      contractId: 'truststreamcc',
      contractFunction: 'RegisterImageProof',
      contractArguments: [
        QUERY_TARGET_ID,
        'Caliper Query Target',
        'seedsha256hash',
        'bafkseedimagecid',
        'bafkseedimagemeta',
        'seedc2pahash',
      ],
      timeout: 30,
    };

    await this.sutAdapter.sendRequests(args);
  }
}

function createWorkloadModule() {
  return new SeedQueryTargetWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
module.exports.QUERY_TARGET_ID = QUERY_TARGET_ID;
