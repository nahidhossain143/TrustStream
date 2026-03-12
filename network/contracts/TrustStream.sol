// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TrustStream {

    enum OrgRole { NewsAgency, Broadcaster, Auditor }

    struct Organization {
        string  name;
        OrgRole role;
        bool    isActive;
    }

    struct VideoRecord {
        string  videoId;
        string  title;
        string  uploader;
        address uploaderAddr;
        uint256 totalSegments;
        uint256 registeredAt;
        bool    exists;
    }

    struct VideoAsset {
        string   videoId;
        uint256  segmentIndex;
        string   sha256Hash;
        string   chainHash;
        uint256  timestamp;
        address  submitter;
        bool     exists;
    }

    struct Endorsement {
        address  endorser;
        string   orgName;
        OrgRole  role;
        uint256  timestamp;
    }

    struct TxLog {
        string   action;
        string   videoId;
        uint256  segmentIndex;
        address  actor;
        string   orgName;
        uint256  timestamp;
    }

    mapping(address => Organization) public organizations;
    address[] public orgAddresses;
    mapping(string => VideoRecord) public videoRecords;
    mapping(string => mapping(uint256 => VideoAsset)) public assets;
    mapping(string => mapping(uint256 => Endorsement[])) public endorsements;
    mapping(string => mapping(uint256 => mapping(address => bool))) public hasEndorsed;

    TxLog[] public txLogs;
    uint256 public constant REQUIRED_ENDORSEMENTS = 2;

    event VideoRegistered(string indexed videoId, string title, address indexed uploader, uint256 totalSegments, uint256 timestamp);
    event SegmentRegistered(string indexed videoId, uint256 indexed segmentIndex, string sha256Hash, string chainHash, address indexed submitter, uint256 timestamp);
    event SegmentEndorsed(string indexed videoId, uint256 indexed segmentIndex, address indexed endorser, string orgName, OrgRole role, uint256 timestamp);
    event FullyEndorsed(string indexed videoId, uint256 indexed segmentIndex, uint256 endorsementCount, uint256 timestamp);

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
        _;
    }

    constructor(address newsAgencyAddr, address broadcasterAddr, address auditorAddr) {
        _registerOrg(newsAgencyAddr, "NewsAgency",  OrgRole.NewsAgency);
        _registerOrg(broadcasterAddr, "Broadcaster", OrgRole.Broadcaster);
        _registerOrg(auditorAddr, "Auditor",      OrgRole.Auditor);
    }

    function _registerOrg(address addr, string memory name, OrgRole role) internal {
        organizations[addr] = Organization({ name: name, role: role, isActive: true });
        orgAddresses.push(addr);
    }

    function registerVideo(string memory videoId, string memory title, uint256 totalSegments) public onlyNewsAgency {
        require(!videoRecords[videoId].exists, "Video already registered");
        videoRecords[videoId] = VideoRecord({
            videoId: videoId, title: title,
            uploader: organizations[msg.sender].name,
            uploaderAddr: msg.sender,
            totalSegments: totalSegments,
            registeredAt: block.timestamp,
            exists: true
        });
        txLogs.push(TxLog({ action: "REGISTER_VIDEO", videoId: videoId, segmentIndex: 0, actor: msg.sender, orgName: organizations[msg.sender].name, timestamp: block.timestamp }));
        emit VideoRegistered(videoId, title, msg.sender, totalSegments, block.timestamp);
    }

    function registerSegment(string memory videoId, uint256 segmentIndex, string memory sha256Hash, string memory chainHash) public onlyNewsAgency {
        require(!assets[videoId][segmentIndex].exists, "Segment already registered");
        assets[videoId][segmentIndex] = VideoAsset({
            videoId: videoId, segmentIndex: segmentIndex,
            sha256Hash: sha256Hash, chainHash: chainHash,
            timestamp: block.timestamp, submitter: msg.sender, exists: true
        });
        _addEndorsement(videoId, segmentIndex, msg.sender);
        txLogs.push(TxLog({ action: "REGISTER_SEGMENT", videoId: videoId, segmentIndex: segmentIndex, actor: msg.sender, orgName: organizations[msg.sender].name, timestamp: block.timestamp }));
        emit SegmentRegistered(videoId, segmentIndex, sha256Hash, chainHash, msg.sender, block.timestamp);
    }

    function endorseSegment(string memory videoId, uint256 segmentIndex) public onlyEndorser {
        require(assets[videoId][segmentIndex].exists, "Segment not registered");
        require(!hasEndorsed[videoId][segmentIndex][msg.sender], "Already endorsed");
        _addEndorsement(videoId, segmentIndex, msg.sender);
        txLogs.push(TxLog({ action: "ENDORSE", videoId: videoId, segmentIndex: segmentIndex, actor: msg.sender, orgName: organizations[msg.sender].name, timestamp: block.timestamp }));
        emit SegmentEndorsed(videoId, segmentIndex, msg.sender, organizations[msg.sender].name, organizations[msg.sender].role, block.timestamp);
        uint256 count = endorsements[videoId][segmentIndex].length;
        if (count >= REQUIRED_ENDORSEMENTS) {
            emit FullyEndorsed(videoId, segmentIndex, count, block.timestamp);
        }
    }

    function _addEndorsement(string memory videoId, uint256 segmentIndex, address endorser) internal {
        endorsements[videoId][segmentIndex].push(Endorsement({
            endorser: endorser, orgName: organizations[endorser].name,
            role: organizations[endorser].role, timestamp: block.timestamp
        }));
        hasEndorsed[videoId][segmentIndex][endorser] = true;
    }

    function verifySegment(string memory videoId, uint256 segmentIndex, string memory sha256Hash) public view returns (bool hashMatch, bool fullyEndorsed, uint256 endorsementCount) {
        VideoAsset memory asset = assets[videoId][segmentIndex];
        hashMatch        = keccak256(bytes(asset.sha256Hash)) == keccak256(bytes(sha256Hash));
        endorsementCount = endorsements[videoId][segmentIndex].length;
        fullyEndorsed    = endorsementCount >= REQUIRED_ENDORSEMENTS;
    }

    function getVideo(string memory videoId) public view returns (string memory title, string memory uploader, address uploaderAddr, uint256 totalSegments, uint256 registeredAt, bool exists) {
        VideoRecord memory v = videoRecords[videoId];
        return (v.title, v.uploader, v.uploaderAddr, v.totalSegments, v.registeredAt, v.exists);
    }

    function getSegment(string memory videoId, uint256 segmentIndex) public view returns (string memory sha256Hash, string memory chainHash, uint256 timestamp, address submitter, uint256 endorsementCount, bool fullyEndorsed) {
        VideoAsset memory asset = assets[videoId][segmentIndex];
        return (asset.sha256Hash, asset.chainHash, asset.timestamp, asset.submitter, endorsements[videoId][segmentIndex].length, endorsements[videoId][segmentIndex].length >= REQUIRED_ENDORSEMENTS);
    }

    function getEndorsements(string memory videoId, uint256 segmentIndex) public view returns (address[] memory, string[] memory, uint256[] memory) {
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

    function getTxLogCount() public view returns (uint256) { return txLogs.length; }

    function getTxLog(uint256 index) public view returns (string memory action, string memory videoId, uint256 segmentIndex, address actor, string memory orgName, uint256 timestamp) {
        TxLog memory log = txLogs[index];
        return (log.action, log.videoId, log.segmentIndex, log.actor, log.orgName, log.timestamp);
    }

    function getOrganizations() public view returns (address[] memory) { return orgAddresses; }
}