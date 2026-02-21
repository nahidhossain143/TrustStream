TrustStream: Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming

TrustStream is a research-based framework designed to combat the growing crisis of trust in digital news caused by Generative AI and deepfakes. By integrating Hyperledger Fabric with C2PA-compliant video processing, this project provides a decentralized, scalable architecture for ensuring the authenticity and integrity of digital news content.
📖 Introduction

The rapid advancement of synthetic media has made it increasingly difficult to verify the credibility of digital news. While the Coalition for Content Provenance and Authenticity (C2PA) offers cryptographic standards, existing models are often centralized and lack empirical validation for high-volume news streaming.

TrustStream addresses these gaps by:

    Moving away from centralized trust models to a multi-organization consortium.

    Integrating blockchain technology to create an immutable record of media provenance.

    Benchmarking performance metrics like throughput and latency for real-world news workloads.

🛠 Methodology

The TrustStream framework operates through a four-step pipeline to ensure secure and verifiable news processing:

    Ingestion: News video files are collected and segmented into granular chunks (2s, 4s, or 6s) using FFmpeg for efficient processing.

    Hashing: Each segment is cryptographically hashed using a C2PA-compliant generator.

    Endorsement & Validation: A consortium of organizations (simulated as 3, 5, or 7 members) executes endorsement policies to sign and validate the hashes.

    Benchmarking: System performance is evaluated using Hyperledger Caliper to measure Transactions Per Second (TPS) and commit latency.

🔬 Research Gaps Addressed

    G1: Lack of Empirical Validation – Lack of systematic benchmarking for news processing workloads.

    G2: Centralized Trust Models – Incompatibility with multi-organization news consortia.

    G3: Verification Latency – Delays in timely verification as media volume increases.

👥 Contributors

    Sumaiya Aftab (ID: 20220104002) 

    Md Nahid Hossain (ID: 20220104116) 

    Nadia Supti (ID: 20220104146) 

Program: B.Sc. in Computer Science and Engineering Institution: Ahsanullah University of Science and Technology (AUST) Date: January 2026 
📜 Conclusion

TrustStream bridges the gap between theoretical provenance standards and real-world operational requirements. It offers a robust, decentralized solution to combat misinformation and restore public confidence in digital media.
