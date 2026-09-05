'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// Measures RegisterVideoProof throughput + end-to-end latency. Every
// submission needs unanimous endorsement from all 3 orgs' peers (the
// channel's AND policy), so Caliper's per-transaction latency here IS the
// endorsement-confirmation time the thesis asks for -- there is no separate
// "endorsed but not yet committed" state to measure apart from this.
class RegisterVideoProofWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  async submitTransaction() {
    this.txIndex++;
    const videoId = `bench-video-w${this.workerIndex}-r${this.roundIndex}-${this.txIndex}-${Date.now()}`;

    const args = {
      contractId: 'truststreamcc',
      contractFunction: 'RegisterVideoProof',
      contractArguments: [
        videoId,
        'Caliper Benchmark Video',
        `bafkbenchvideometa${this.workerIndex}${this.txIndex}`,
        `benchmerkleroot${this.workerIndex}${this.txIndex}`,
        '3',
      ],
      timeout: 30,
    };

    await this.sutAdapter.sendRequests(args);
  }
}

function createWorkloadModule() {
  return new RegisterVideoProofWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
