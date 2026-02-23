// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TrustStream
 * @notice Decentralized news video provenance with multi-organization endorsement
 * @dev Simulates a consortium of 3 organizations: NewsAgency, Broadcaster, Auditor
 */
contract TrustStream {

    // ── Organization roles ──────────────────────────────────
    enum OrgRole { NewsAgency, Broadcaster, Auditor }

    struct Organization {
        string  name;
        OrgRole role;
        bool    isActive;
    }

    // ── Video segment asset ──────────────────────────────────
    struct VideoAsset {
        string   videoId;
        uint256  segmentIndex;
        string   sha256Hash;
        string   chainHash;
        uint256  timestamp;
        address  submitter;
        bool     exists;
    }

    // ── Endorsement ──────────────────────────────────────────
    struct Endorsement {
        address  endorser;
        string   orgName;
        OrgRole  role;
        uint256  timestamp;
    }

    // ── Storage ──────────────────────────────────────────────
    mapping(address => Organization) public organizations;
    address[] public orgAddresses;

    // videoId => segmentIndex => VideoAsset
    mapping(string => mapping(uint256 => VideoAsset)) public assets;

    // videoId => segmentIndex => endorsements
    mapping(string => mapping(uint256 => Endorsement[])) public endorsements;

    // videoId => segmentIndex => address => hasEndorsed
    mapping(string => mapping(uint256 => mapping(address => bool))) public hasEndorsed;

    // Transaction log
    struct TxLog {
        string   action;     // "REGISTER" | "ENDORSE"
        string   videoId;
        uint256  segmentIndex;
        address  actor;
        string   orgName;
        uint256  timestamp;
    }
    TxLog[] public txLogs;

    // Required endorsements for full verification
    uint256 public constant REQUIRED_ENDORSEMENTS = 2;

    // ── Events ───────────────────────────────────────────────
    event SegmentRegistered(string videoId, uint256 segmentIndex, string sha256Hash, address submitter);
    event SegmentEndorsed(string videoId, uint256 segmentIndex, address endorser, string orgName);
    event FullyEndorsed(string videoId, uint256 segmentIndex);

    // ── Constructor: register 3 default organizations ────────
    constructor(
        address newsAgencyAddr,
        address broadcasterAddr,
        address auditorAddr
    ) {
        _registerOrg(newsAgencyAddr, "NewsAgency", OrgRole.NewsAgency);
        _registerOrg(broadcasterAddr, "Broadcaster", OrgRole.Broadcaster);
        _registerOrg(auditorAddr, "Auditor", OrgRole.Auditor);
    }

    function _registerOrg(address addr, string memory name, OrgRole role) internal {
        organizations[addr] = Organization({ name: name, role: role, isActive: true });
        orgAddresses.push(addr);
    }

    // ── Register a video segment ─────────────────────────────
    function registerSegment(
        string memory videoId,
        uint256 segmentIndex,
        string memory sha256Hash,
        string memory chainHash
    ) public {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        require(!assets[videoId][segmentIndex].exists, "Segment already registered");

        assets[videoId][segmentIndex] = VideoAsset({
            videoId:      videoId,
            segmentIndex: segmentIndex,
            sha256Hash:   sha256Hash,
            chainHash:    chainHash,
            timestamp:    block.timestamp,
            submitter:    msg.sender,
            exists:       true
        });

        // Auto-endorse by submitter
        _addEndorsement(videoId, segmentIndex, msg.sender);

        // Log transaction
        txLogs.push(TxLog({
            action:       "REGISTER",
            videoId:      videoId,
            segmentIndex: segmentIndex,
            actor:        msg.sender,
            orgName:      organizations[msg.sender].name,
            timestamp:    block.timestamp
        }));

        emit SegmentRegistered(videoId, segmentIndex, sha256Hash, msg.sender);
    }

    // ── Endorse a segment ────────────────────────────────────
    function endorseSegment(
        string memory videoId,
        uint256 segmentIndex
    ) public {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        require(assets[videoId][segmentIndex].exists, "Segment not registered");
        require(!hasEndorsed[videoId][segmentIndex][msg.sender], "Already endorsed");

        _addEndorsement(videoId, segmentIndex, msg.sender);

        txLogs.push(TxLog({
            action:       "ENDORSE",
            videoId:      videoId,
            segmentIndex: segmentIndex,
            actor:        msg.sender,
            orgName:      organizations[msg.sender].name,
            timestamp:    block.timestamp
        }));

        emit SegmentEndorsed(videoId, segmentIndex, msg.sender, organizations[msg.sender].name);

        if (endorsements[videoId][segmentIndex].length >= REQUIRED_ENDORSEMENTS) {
            emit FullyEndorsed(videoId, segmentIndex);
        }
    }

    function _addEndorsement(string memory videoId, uint256 segmentIndex, address endorser) internal {
        endorsements[videoId][segmentIndex].push(Endorsement({
            endorser:  endorser,
            orgName:   organizations[endorser].name,
            role:      organizations[endorser].role,
            timestamp: block.timestamp
        }));
        hasEndorsed[videoId][segmentIndex][endorser] = true;
    }

    // ── Verify a segment hash ────────────────────────────────
    function verifySegment(
        string memory videoId,
        uint256 segmentIndex,
        string memory sha256Hash
    ) public view returns (bool hashMatch, bool fullyEndorsed, uint256 endorsementCount) {
        VideoAsset memory asset = assets[videoId][segmentIndex];
        hashMatch        = keccak256(bytes(asset.sha256Hash)) == keccak256(bytes(sha256Hash));
        endorsementCount = endorsements[videoId][segmentIndex].length;
        fullyEndorsed    = endorsementCount >= REQUIRED_ENDORSEMENTS;
    }

    // ── Get segment details ──────────────────────────────────
    function getSegment(
        string memory videoId,
        uint256 segmentIndex
    ) public view returns (
        string memory sha256Hash,
        string memory chainHash,
        uint256 timestamp,
        address submitter,
        uint256 endorsementCount,
        bool fullyEndorsed
    ) {
        VideoAsset memory asset = assets[videoId][segmentIndex];
        return (
            asset.sha256Hash,
            asset.chainHash,
            asset.timestamp,
            asset.submitter,
            endorsements[videoId][segmentIndex].length,
            endorsements[videoId][segmentIndex].length >= REQUIRED_ENDORSEMENTS
        );
    }

    // ── Get endorsement list for a segment ───────────────────
    function getEndorsements(
        string memory videoId,
        uint256 segmentIndex
    ) public view returns (address[] memory, string[] memory, uint256[] memory) {
        Endorsement[] memory ends = endorsements[videoId][segmentIndex];
        address[]  memory addrs = new address[](ends.length);
        string[]   memory names = new string[](ends.length);
        uint256[]  memory times = new uint256[](ends.length);
        for (uint256 i = 0; i < ends.length; i++) {
            addrs[i] = ends[i].endorser;
            names[i] = ends[i].orgName;
            times[i] = ends[i].timestamp;
        }
        return (addrs, names, times);
    }

    // ── Get recent transaction logs ──────────────────────────
    function getTxLogCount() public view returns (uint256) {
        return txLogs.length;
    }

    function getTxLog(uint256 index) public view returns (
        string memory action,
        string memory videoId,
        uint256 segmentIndex,
        address actor,
        string memory orgName,
        uint256 timestamp
    ) {
        TxLog memory log = txLogs[index];
        return (log.action, log.videoId, log.segmentIndex, log.actor, log.orgName, log.timestamp);
    }

    // ── Get all org addresses ────────────────────────────────
    function getOrganizations() public view returns (address[] memory) {
        return orgAddresses;
    }
}
