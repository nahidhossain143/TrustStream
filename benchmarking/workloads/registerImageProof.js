'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// Same measurement as registerVideoProof.js, on the lighter RegisterImageProof
// call -- used at multiple worker counts (see benchmarks/config.yaml) to show
// throughput/latency under increasing concurrent load.
class RegisterImageProofWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  async submitTransaction() {
    this.txIndex++;
    const imageId = `bench-image-w${this.workerIndex}-r${this.roundIndex}-${this.txIndex}-${Date.now()}`;

    const args = {
      contractId: 'truststreamcc',
      contractFunction: 'RegisterImageProof',
      contractArguments: [
        imageId,
        'Caliper Benchmark Image',
        `benchsha256${this.workerIndex}${this.txIndex}`,
        `bafkbenchimagecid${this.workerIndex}${this.txIndex}`,
        `bafkbenchimagemeta${this.workerIndex}${this.txIndex}`,
        `benchc2pahash${this.workerIndex}${this.txIndex}`,
      ],
      timeout: 30,
    };

    await this.sutAdapter.sendRequests(args);
  }
}

function createWorkloadModule() {
  return new RegisterImageProofWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
