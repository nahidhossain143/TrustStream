// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TrustStream
 * @notice Decentralized news video provenance with multi-organization endorsement
 * @dev Consortium of 3 organizations: NewsAgency, Broadcaster, Auditor
 *      - Only NewsAgency can register segments
 *      - Only Broadcaster and Auditor can endorse
 *      - Video metadata is stored on-chain for full provenance
 */
contract TrustStream {

    // ── Organization roles ───────────────────────────────────
    enum OrgRole { NewsAgency, Broadcaster, Auditor }

    struct Organization {
        string  name;
        OrgRole role;
        bool    isActive;
    }

    // ── Video metadata (on-chain provenance record) ──────────
    struct VideoRecord {
        string  videoId;
        string  title;
        string  uploader;       // org name of uploader
        address uploaderAddr;
        uint256 totalSegments;
        uint256 registeredAt;
        bool    exists;
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

    // ── Transaction log ──────────────────────────────────────
    struct TxLog {
        string   action;       // "REGISTER_VIDEO" | "REGISTER_SEGMENT" | "ENDORSE"
        string   videoId;
        uint256  segmentIndex;
        address  actor;
        string   orgName;
        uint256  timestamp;
    }

    // ── Storage ──────────────────────────────────────────────
    mapping(address => Organization) public organizations;
    address[] public orgAddresses;

    // videoId => VideoRecord
    mapping(string => VideoRecord) public videoRecords;

    // videoId => segmentIndex => VideoAsset
    mapping(string => mapping(uint256 => VideoAsset)) public assets;

    // videoId => segmentIndex => endorsements
    mapping(string => mapping(uint256 => Endorsement[])) public endorsements;

    // videoId => segmentIndex => address => hasEndorsed
    mapping(string => mapping(uint256 => mapping(address => bool))) public hasEndorsed;

    TxLog[] public txLogs;

    uint256 public constant REQUIRED_ENDORSEMENTS = 2;

    // ── Events ───────────────────────────────────────────────
    event VideoRegistered(
        string indexed videoId,
        string title,
        address indexed uploader,
        uint256 totalSegments,
        uint256 timestamp
    );
    event SegmentRegistered(
        string indexed videoId,
        uint256 indexed segmentIndex,
        string sha256Hash,
        string chainHash,
        address indexed submitter,
        uint256 timestamp
    );
    event SegmentEndorsed(
        string indexed videoId,
        uint256 indexed segmentIndex,
        address indexed endorser,
        string orgName,
        OrgRole role,
        uint256 timestamp
    );
    event FullyEndorsed(
        string indexed videoId,
        uint256 indexed segmentIndex,
        uint256 endorsementCount,
        uint256 timestamp
    );

    // ── Modifiers ────────────────────────────────────────────

    modifier onlyOrg() {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        _;
    }

    modifier onlyNewsAgency() {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        require(organizations[msg.sender].role == OrgRole.NewsAgency, "Only NewsAgency can register segments");
        _;
    }

    modifier onlyEndorser() {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        require(
            organizations[msg.sender].role == OrgRole.Broadcaster ||
            organizations[msg.sender].role == OrgRole.Auditor,
            "Only Broadcaster or Auditor can endorse"
        );
        _;
    }

    // ── Constructor ──────────────────────────────────────────
    constructor(
        address newsAgencyAddr,
        address broadcasterAddr,
        address auditorAddr
    ) {
        _registerOrg(newsAgencyAddr, "NewsAgency",  OrgRole.NewsAgency);
        _registerOrg(broadcasterAddr, "Broadcaster", OrgRole.Broadcaster);
        _registerOrg(auditorAddr, "Auditor",      OrgRole.Auditor);
    }

    function _registerOrg(address addr, string memory name, OrgRole role) internal {
        organizations[addr] = Organization({ name: name, role: role, isActive: true });
        orgAddresses.push(addr);
    }

    // ── Register video metadata on-chain ─────────────────────
    function registerVideo(
        string memory videoId,
        string memory title,
        uint256 totalSegments
    ) public onlyNewsAgency {
        require(!videoRecords[videoId].exists, "Video already registered");

        videoRecords[videoId] = VideoRecord({
            videoId:       videoId,
            title:         title,
            uploader:      organizations[msg.sender].name,
            uploaderAddr:  msg.sender,
            totalSegments: totalSegments,
            registeredAt:  block.timestamp,
            exists:        true
        });

        txLogs.push(TxLog({
            action:       "REGISTER_VIDEO",
            videoId:      videoId,
            segmentIndex: 0,
            actor:        msg.sender,
            orgName:      organizations[msg.sender].name,
            timestamp:    block.timestamp
        }));

        emit VideoRegistered(videoId, title, msg.sender, totalSegments, block.timestamp);
    }

    // ── Register a video segment ─────────────────────────────
    function registerSegment(
        string memory videoId,
        uint256 segmentIndex,
        string memory sha256Hash,
        string memory chainHash
    ) public onlyNewsAgency {
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

        // NewsAgency auto-endorses on registration
        _addEndorsement(videoId, segmentIndex, msg.sender);

        txLogs.push(TxLog({
            action:       "REGISTER_SEGMENT",
            videoId:      videoId,
            segmentIndex: segmentIndex,
            actor:        msg.sender,
            orgName:      organizations[msg.sender].name,
            timestamp:    block.timestamp
        }));

        emit SegmentRegistered(videoId, segmentIndex, sha256Hash, chainHash, msg.sender, block.timestamp);
    }

    // ── Endorse a segment ────────────────────────────────────
    function endorseSegment(
        string memory videoId,
        uint256 segmentIndex
    ) public onlyEndorser {
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

        emit SegmentEndorsed(
            videoId,
            segmentIndex,
            msg.sender,
            organizations[msg.sender].name,
            organizations[msg.sender].role,
            block.timestamp
        );

        uint256 count = endorsements[videoId][segmentIndex].length;
        if (count >= REQUIRED_ENDORSEMENTS) {
            emit FullyEndorsed(videoId, segmentIndex, count, block.timestamp);
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

    // ── Get video metadata ───────────────────────────────────
    function getVideo(string memory videoId) public view returns (
        string memory title,
        string memory uploader,
        address uploaderAddr,
        uint256 totalSegments,
        uint256 registeredAt,
        bool exists
    ) {
        VideoRecord memory v = videoRecords[videoId];
        return (v.title, v.uploader, v.uploaderAddr, v.totalSegments, v.registeredAt, v.exists);
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
        address[] memory addrs = new address[](ends.length);
        string[]  memory names = new string[](ends.length);
        uint256[] memory times = new uint256[](ends.length);
        for (uint256 i = 0; i < ends.length; i++) {
            addrs[i] = ends[i].endorser;
            names[i] = ends[i].orgName;
            times[i] = ends[i].timestamp;
        }
        return (addrs, names, times);
    }

    // ── Transaction logs ─────────────────────────────────────
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
