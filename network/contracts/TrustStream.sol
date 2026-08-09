// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TrustStream {

    // ─────────────────────────────────────────────
    //  Enums
    // ─────────────────────────────────────────────
    enum OrgRole { NewsAgency, Broadcaster, Auditor }
    enum MediaStatus { Active, Revoked, Disputed }

    // ─────────────────────────────────────────────
    //  Structs
    // ─────────────────────────────────────────────
    struct Organization {
        string name;
        OrgRole role;
        bool isActive;
    }

    struct VideoRecord {
        string videoId;
        string title;
        string metadataCid;
        string uploader;
        address uploaderAddr;
        uint256 totalSegments;
        uint256 registeredAt;
        MediaStatus status;
        uint256 tamperReports;
        bool exists;
    }

    struct VideoAsset {
        string videoId;
        uint256 segmentIndex;
        string sha256Hash;
        string chainHash;
        string ipfsCid;
        string c2paManifestHash;
        string c2paInstanceId;
        uint256 timestamp;
        address submitter;
        uint256 tamperReports;
        bool exists;
    }

    struct MerkleAnchor {
        bytes32 merkleRoot;
        address anchoredBy;
        uint256 anchoredAt;
        bool exists;
    }

    struct Endorsement {
        address endorser;
        string orgName;
        OrgRole role;
        uint256 timestamp;
    }

    struct ImageRecord {
        string imageId;
        string title;
        string description;
        string sha256Hash;
        string ipfsCid;
        string metadataCid;
        string c2paManifestHash;
        string c2paInstanceId;
        string uploader;
        address uploaderAddr;
        uint256 registeredAt;
        MediaStatus status;
        uint256 tamperReports;
        bool exists;
    }

    struct TxLog {
        string action;
        string mediaId;
        uint256 segmentIndex;
        address actor;
        string orgName;
        uint256 timestamp;
    }

    // ─────────────────────────────────────────────
    //  State Variables
    // ─────────────────────────────────────────────
    mapping(address => Organization) public organizations;
    address[] public orgAddresses;

    string[] public videoIds;
    mapping(string => VideoRecord) internal videoRecords;
    mapping(string => mapping(uint256 => VideoAsset)) internal assets;
    mapping(string => mapping(uint256 => Endorsement[])) public endorsements;
    mapping(string => mapping(uint256 => mapping(address => bool))) public hasEndorsed;
    mapping(string => mapping(uint256 => mapping(address => bool))) public hasTamperReported;
    mapping(string => MerkleAnchor) internal merkleAnchors;

    string[] public imageIds;
    mapping(string => ImageRecord) internal imageRecords;
    mapping(string => Endorsement[]) public imageEndorsements;
    mapping(string => mapping(address => bool)) public hasEndorsedImage;
    mapping(string => mapping(address => bool)) public hasImageTamperReported;

    TxLog[] public txLogs;

    uint256 public constant REQUIRED_ENDORSEMENTS = 2;
    uint256 public constant TAMPER_THRESHOLD = 2;

    // ─────────────────────────────────────────────
    //  Events — Video
    // ─────────────────────────────────────────────
    event VideoRegistered(
        string indexed videoId,
        string title,
        string metadataCid,
        address indexed uploader,
        uint256 totalSegments,
        uint256 timestamp
    );

    event SegmentRegistered(
        string indexed videoId,
        uint256 indexed segmentIndex,
        string sha256Hash,
        string chainHash,
        string ipfsCid,
        address indexed submitter,
        uint256 timestamp
    );

    event MerkleRootAnchored(
        string indexed videoId,
        bytes32 indexed merkleRoot,
        address indexed anchoredBy,
        uint256 totalSegments,
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

    event TamperReported(
        string indexed videoId,
        uint256 indexed segmentIndex,
        address indexed reporter,
        uint256 segmentReports,
        uint256 videoReports,
        uint256 timestamp
    );

    event VideoRevoked(
        string indexed videoId,
        address indexed revokedBy,
        uint256 timestamp
    );

    event VideoDisputed(
        string indexed videoId,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────
    //  Events — Image
    // ─────────────────────────────────────────────
    event ImageRegistered(
        string indexed imageId,
        string title,
        string ipfsCid,
        string sha256Hash,
        address indexed uploader,
        uint256 timestamp
    );

    event ImageEndorsed(
        string indexed imageId,
        address indexed endorser,
        string orgName,
        OrgRole role,
        uint256 timestamp
    );

    event ImageFullyEndorsed(
        string indexed imageId,
        uint256 endorsementCount,
        uint256 timestamp
    );

    event ImageTamperReported(
        string indexed imageId,
        address indexed reporter,
        uint256 totalReports,
        uint256 timestamp
    );

    event ImageRevoked(
        string indexed imageId,
        address indexed revokedBy,
        uint256 timestamp
    );

    event ImageDisputed(
        string indexed imageId,
        uint256 timestamp
    );

    // ─────────────────────────────────────────────
    //  Modifiers
    // ─────────────────────────────────────────────
    modifier onlyNewsAgency() {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        require(
            organizations[msg.sender].role == OrgRole.NewsAgency,
            "Only NewsAgency can register media"
        );
        _;
    }

    modifier onlyEndorser() {
        require(organizations[msg.sender].isActive, "Not a registered organization");
        _;
    }

    // ─────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────
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
        organizations[addr] = Organization({
            name: name,
            role: role,
            isActive: true
        });
        orgAddresses.push(addr);
    }

    // ═════════════════════════════════════════════
    //  VIDEO FUNCTIONS
    // ═════════════════════════════════════════════
    function registerVideo(
        string memory videoId,
        string memory title,
        string memory metadataCid,
        uint256 totalSegments
    ) public onlyNewsAgency {
        require(!videoRecords[videoId].exists, "Video already registered");

        VideoRecord storage v = videoRecords[videoId];
        v.videoId = videoId;
        v.title = title;
        v.metadataCid = metadataCid;
        v.uploader = organizations[msg.sender].name;
        v.uploaderAddr = msg.sender;
        v.totalSegments = totalSegments;
        v.registeredAt = block.timestamp;
        v.status = MediaStatus.Active;
        v.exists = true;

        videoIds.push(videoId);

        _logTx("REGISTER_VIDEO", videoId, 0);
        emit VideoRegistered(videoId, title, metadataCid, msg.sender, totalSegments, block.timestamp);
    }

    function registerSegment(
        string memory videoId,
        uint256 segmentIndex,
        string memory sha256Hash,
        string memory chainHash,
        string memory ipfsCid,
        string memory c2paManifestHash,
        string memory c2paInstanceId
    ) public onlyNewsAgency {
        require(videoRecords[videoId].exists, "Video not registered");
        require(videoRecords[videoId].status == MediaStatus.Active, "Video not active");
        require(!assets[videoId][segmentIndex].exists, "Segment already registered");

        VideoAsset storage a = assets[videoId][segmentIndex];
        a.videoId = videoId;
        a.segmentIndex = segmentIndex;
        a.sha256Hash = sha256Hash;
        a.chainHash = chainHash;
        a.ipfsCid = ipfsCid;
        a.c2paManifestHash = c2paManifestHash;
        a.c2paInstanceId = c2paInstanceId;
        a.timestamp = block.timestamp;
        a.submitter = msg.sender;
        a.exists = true;

        _addEndorsement(videoId, segmentIndex, msg.sender);

        _logTx("REGISTER_SEGMENT", videoId, segmentIndex);
        emit SegmentRegistered(videoId, segmentIndex, sha256Hash, chainHash, ipfsCid, msg.sender, block.timestamp);
    }

    function anchorMerkleRoot(
        string memory videoId,
        bytes32 merkleRoot
    ) public onlyNewsAgency {
        require(videoRecords[videoId].exists, "Video not registered");
        require(videoRecords[videoId].status == MediaStatus.Active, "Video not active");
        require(merkleRoot != bytes32(0), "Invalid Merkle root");
        require(!merkleAnchors[videoId].exists, "Merkle root already anchored");

        merkleAnchors[videoId] = MerkleAnchor({
            merkleRoot: merkleRoot,
            anchoredBy: msg.sender,
            anchoredAt: block.timestamp,
            exists: true
        });

        _logTx("ANCHOR_MERKLE_ROOT", videoId, 0);

        emit MerkleRootAnchored(
            videoId,
            merkleRoot,
            msg.sender,
            videoRecords[videoId].totalSegments,
            block.timestamp
        );
    }

    function endorseSegment(string memory videoId, uint256 segmentIndex) public onlyEndorser {
        require(assets[videoId][segmentIndex].exists, "Segment not registered");
        require(videoRecords[videoId].status == MediaStatus.Active, "Video not active");
        require(!hasEndorsed[videoId][segmentIndex][msg.sender], "Already endorsed");

        _addEndorsement(videoId, segmentIndex, msg.sender);

        _logTx("ENDORSE_SEGMENT", videoId, segmentIndex);
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

    function reportTamper(string memory videoId, uint256 segmentIndex) public onlyEndorser {
        require(assets[videoId][segmentIndex].exists, "Segment not registered");
        require(!hasTamperReported[videoId][segmentIndex][msg.sender], "Already reported");
        require(videoRecords[videoId].status == MediaStatus.Active, "Video not active");

        hasTamperReported[videoId][segmentIndex][msg.sender] = true;
        assets[videoId][segmentIndex].tamperReports += 1;
        videoRecords[videoId].tamperReports += 1;

        uint256 segReports = assets[videoId][segmentIndex].tamperReports;
        uint256 videoReports = videoRecords[videoId].tamperReports;

        _logTx("REPORT_TAMPER", videoId, segmentIndex);
        emit TamperReported(videoId, segmentIndex, msg.sender, segReports, videoReports, block.timestamp);

        if (segReports >= TAMPER_THRESHOLD || videoReports >= TAMPER_THRESHOLD) {
            videoRecords[videoId].status = MediaStatus.Disputed;
            emit VideoDisputed(videoId, block.timestamp);
        }
    }

    function revokeVideo(string memory videoId) public onlyNewsAgency {
        require(videoRecords[videoId].exists, "Video not registered");
        require(videoRecords[videoId].uploaderAddr == msg.sender, "Only uploader can revoke");
        require(videoRecords[videoId].status != MediaStatus.Revoked, "Already revoked");

        videoRecords[videoId].status = MediaStatus.Revoked;

        _logTx("REVOKE_VIDEO", videoId, 0);
        emit VideoRevoked(videoId, msg.sender, block.timestamp);
    }

    function _addEndorsement(string memory videoId, uint256 segmentIndex, address endorser) internal {
        endorsements[videoId][segmentIndex].push(Endorsement({
            endorser: endorser,
            orgName: organizations[endorser].name,
            role: organizations[endorser].role,
            timestamp: block.timestamp
        }));
        hasEndorsed[videoId][segmentIndex][endorser] = true;
    }

    // ═════════════════════════════════════════════
    //  IMAGE FUNCTIONS
    // ═════════════════════════════════════════════
    function registerImage(
        string memory imageId,
        string memory title,
        string memory description,
        string memory sha256Hash,
        string memory ipfsCid,
        string memory metadataCid,
        string memory c2paManifestHash,
        string memory c2paInstanceId
    ) public onlyNewsAgency {
        require(!imageRecords[imageId].exists, "Image already registered");

        ImageRecord storage img = imageRecords[imageId];
        img.imageId = imageId;
        img.title = title;
        img.description = description;
        img.sha256Hash = sha256Hash;
        img.ipfsCid = ipfsCid;
        img.metadataCid = metadataCid;
        img.c2paManifestHash = c2paManifestHash;
        img.c2paInstanceId = c2paInstanceId;
        img.uploader = organizations[msg.sender].name;
        img.uploaderAddr = msg.sender;
        img.registeredAt = block.timestamp;
        img.status = MediaStatus.Active;
        img.exists = true;

        imageIds.push(imageId);

        _addImageEndorsement(imageId, msg.sender);

        _logTx("REGISTER_IMAGE", imageId, 0);
        emit ImageRegistered(imageId, title, ipfsCid, sha256Hash, msg.sender, block.timestamp);
    }

    function endorseImage(string memory imageId) public onlyEndorser {
        require(imageRecords[imageId].exists, "Image not registered");
        require(imageRecords[imageId].status == MediaStatus.Active, "Image not active");
        require(!hasEndorsedImage[imageId][msg.sender], "Already endorsed");

        _addImageEndorsement(imageId, msg.sender);

        _logTx("ENDORSE_IMAGE", imageId, 0);
        emit ImageEndorsed(
            imageId,
            msg.sender,
            organizations[msg.sender].name,
            organizations[msg.sender].role,
            block.timestamp
        );

        uint256 count = imageEndorsements[imageId].length;
        if (count >= REQUIRED_ENDORSEMENTS) {
            emit ImageFullyEndorsed(imageId, count, block.timestamp);
        }
    }

    function reportImageTamper(string memory imageId) public onlyEndorser {
        require(imageRecords[imageId].exists, "Image not registered");
        require(imageRecords[imageId].status == MediaStatus.Active, "Image not active");
        require(!hasImageTamperReported[imageId][msg.sender], "Already reported");

        hasImageTamperReported[imageId][msg.sender] = true;
        imageRecords[imageId].tamperReports += 1;

        uint256 total = imageRecords[imageId].tamperReports;

        _logTx("REPORT_IMAGE_TAMPER", imageId, 0);
        emit ImageTamperReported(imageId, msg.sender, total, block.timestamp);

        if (total >= TAMPER_THRESHOLD) {
            imageRecords[imageId].status = MediaStatus.Disputed;
            emit ImageDisputed(imageId, block.timestamp);
        }
    }

    function revokeImage(string memory imageId) public onlyNewsAgency {
        require(imageRecords[imageId].exists, "Image not registered");
        require(imageRecords[imageId].uploaderAddr == msg.sender, "Only uploader can revoke");
        require(imageRecords[imageId].status != MediaStatus.Revoked, "Already revoked");

        imageRecords[imageId].status = MediaStatus.Revoked;

        _logTx("REVOKE_IMAGE", imageId, 0);
        emit ImageRevoked(imageId, msg.sender, block.timestamp);
    }

    function verifyImage(
        string memory imageId,
        string memory sha256Hash
    ) public view returns (
        bool hashMatch,
        bool fullyEndorsed,
        uint256 endorsementCount,
        uint8 status
    ) {
        ImageRecord storage img = imageRecords[imageId];
        hashMatch = keccak256(bytes(img.sha256Hash)) == keccak256(bytes(sha256Hash));
        endorsementCount = imageEndorsements[imageId].length;
        fullyEndorsed = endorsementCount >= REQUIRED_ENDORSEMENTS;
        status = uint8(img.status);
    }

    function _addImageEndorsement(string memory imageId, address endorser) internal {
        imageEndorsements[imageId].push(Endorsement({
            endorser: endorser,
            orgName: organizations[endorser].name,
            role: organizations[endorser].role,
            timestamp: block.timestamp
        }));
        hasEndorsedImage[imageId][endorser] = true;
    }

    // ═════════════════════════════════════════════
    //  VIEW FUNCTIONS — Video
    // ═════════════════════════════════════════════
    function getMerkleRoot(
        string memory videoId
    ) public view returns (
        bytes32 merkleRoot,
        address anchoredBy,
        uint256 anchoredAt,
        bool exists
    ) {
        MerkleAnchor storage anchor = merkleAnchors[videoId];

        merkleRoot = anchor.merkleRoot;
        anchoredBy = anchor.anchoredBy;
        anchoredAt = anchor.anchoredAt;
        exists = anchor.exists;
    }

    function verifySegment(
        string memory videoId,
        uint256 segmentIndex,
        string memory sha256Hash
    ) public view returns (bool hashMatch, bool fullyEndorsed, uint256 endorsementCount) {
        VideoAsset storage asset = assets[videoId][segmentIndex];
        hashMatch = keccak256(bytes(asset.sha256Hash)) == keccak256(bytes(sha256Hash));
        endorsementCount = endorsements[videoId][segmentIndex].length;
        fullyEndorsed = endorsementCount >= REQUIRED_ENDORSEMENTS;
    }

    function getVideo(string memory videoId)
        public view
        returns (
            string memory title,
            string memory metadataCid,
            string memory uploader,
            address uploaderAddr,
            uint256 totalSegments,
            uint256 registeredAt,
            uint8 status,
            uint256 tamperReports,
            bool exists
        )
    {
        VideoRecord storage v = videoRecords[videoId];
        title = v.title;
        metadataCid = v.metadataCid;
        uploader = v.uploader;
        uploaderAddr = v.uploaderAddr;
        totalSegments = v.totalSegments;
        registeredAt = v.registeredAt;
        status = uint8(v.status);
        tamperReports = v.tamperReports;
        exists = v.exists;
    }

    function getSegment(
        string memory videoId,
        uint256 segmentIndex
    ) public view returns (
        string memory sha256Hash,
        string memory chainHash,
        string memory ipfsCid,
        string memory c2paManifestHash,
        string memory c2paInstanceId,
        uint256 timestamp,
        address submitter,
        bool exists
    ) {
        VideoAsset storage asset = assets[videoId][segmentIndex];
        sha256Hash = asset.sha256Hash;
        chainHash = asset.chainHash;
        ipfsCid = asset.ipfsCid;
        c2paManifestHash = asset.c2paManifestHash;
        c2paInstanceId = asset.c2paInstanceId;
        timestamp = asset.timestamp;
        submitter = asset.submitter;
        exists = asset.exists;
    }

    function getSegmentStatus(
        string memory videoId,
        uint256 segmentIndex
    ) public view returns (
        uint256 endorsementCount,
        uint256 tamperReports,
        bool fullyEndorsed
    ) {
        VideoAsset storage asset = assets[videoId][segmentIndex];
        endorsementCount = endorsements[videoId][segmentIndex].length;
        tamperReports = asset.tamperReports;
        fullyEndorsed = endorsementCount >= REQUIRED_ENDORSEMENTS;
    }

    function getEndorsements(
        string memory videoId,
        uint256 segmentIndex
    ) public view returns (address[] memory, string[] memory, uint256[] memory) {
        Endorsement[] storage ends = endorsements[videoId][segmentIndex];
        uint256 n = ends.length;
        address[] memory addrs = new address[](n);
        string[] memory names = new string[](n);
        uint256[] memory times = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            addrs[i] = ends[i].endorser;
            names[i] = ends[i].orgName;
            times[i] = ends[i].timestamp;
        }

        return (addrs, names, times);
    }

    function getVideoIdCount() public view returns (uint256) {
        return videoIds.length;
    }

    function getVideoIdAt(uint256 index) public view returns (string memory) {
        require(index < videoIds.length, "Index out of bounds");
        return videoIds[index];
    }

    // ═════════════════════════════════════════════
    //  VIEW FUNCTIONS — Image
    // ═════════════════════════════════════════════
    function getImageCore(string memory imageId)
        public view
        returns (
            string memory title,
            string memory description,
            string memory uploader,
            address uploaderAddr,
            bool exists
        )
    {
        ImageRecord storage img = imageRecords[imageId];
        title = img.title;
        description = img.description;
        uploader = img.uploader;
        uploaderAddr = img.uploaderAddr;
        exists = img.exists;
    }

    function getImageContent(string memory imageId)
        public view
        returns (
            string memory sha256Hash,
            string memory ipfsCid,
            string memory metadataCid,
            string memory c2paManifestHash,
            string memory c2paInstanceId
        )
    {
        ImageRecord storage img = imageRecords[imageId];
        sha256Hash = img.sha256Hash;
        ipfsCid = img.ipfsCid;
        metadataCid = img.metadataCid;
        c2paManifestHash = img.c2paManifestHash;
        c2paInstanceId = img.c2paInstanceId;
    }

    function getImage(string memory imageId)
        public view
        returns (
            string memory title,
            string memory description,
            string memory sha256Hash,
            string memory ipfsCid,
            string memory metadataCid,
            string memory c2paManifestHash,
            address uploaderAddr,
            bool exists
        )
    {
        ImageRecord storage img = imageRecords[imageId];
        title = img.title;
        description = img.description;
        sha256Hash = img.sha256Hash;
        ipfsCid = img.ipfsCid;
        metadataCid = img.metadataCid;
        c2paManifestHash = img.c2paManifestHash;
        uploaderAddr = img.uploaderAddr;
        exists = img.exists;
    }

    function getImageStatus(string memory imageId)
        public view
        returns (
            uint256 registeredAt,
            uint256 endorsementCount,
            uint256 tamperReports,
            uint8 status
        )
    {
        ImageRecord storage img = imageRecords[imageId];
        registeredAt = img.registeredAt;
        endorsementCount = imageEndorsements[imageId].length;
        tamperReports = img.tamperReports;
        status = uint8(img.status);
    }

    function getImageEndorsements(string memory imageId)
        public view
        returns (address[] memory, string[] memory, uint256[] memory)
    {
        Endorsement[] storage ends = imageEndorsements[imageId];
        uint256 n = ends.length;
        address[] memory addrs = new address[](n);
        string[] memory names = new string[](n);
        uint256[] memory times = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            addrs[i] = ends[i].endorser;
            names[i] = ends[i].orgName;
            times[i] = ends[i].timestamp;
        }

        return (addrs, names, times);
    }

    function getImageIdCount() public view returns (uint256) {
        return imageIds.length;
    }

    function getImageIdAt(uint256 index) public view returns (string memory) {
        require(index < imageIds.length, "Index out of bounds");
        return imageIds[index];
    }

    // ═════════════════════════════════════════════
    //  TxLog FUNCTIONS
    // ═════════════════════════════════════════════
    function _logTx(string memory action, string memory mediaId, uint256 segmentIndex) internal {
        txLogs.push(TxLog({
            action: action,
            mediaId: mediaId,
            segmentIndex: segmentIndex,
            actor: msg.sender,
            orgName: organizations[msg.sender].name,
            timestamp: block.timestamp
        }));
    }

    function getTxLogCount() public view returns (uint256) {
        return txLogs.length;
    }

    function getTxLog(uint256 index)
        public view
        returns (
            string memory action,
            string memory mediaId,
            uint256 segmentIndex,
            address actor,
            string memory orgName,
            uint256 timestamp
        )
    {
        TxLog storage log = txLogs[index];
        action = log.action;
        mediaId = log.mediaId;
        segmentIndex = log.segmentIndex;
        actor = log.actor;
        orgName = log.orgName;
        timestamp = log.timestamp;
    }

    function getOrganizations() public view returns (address[] memory) {
        return orgAddresses;
    }
}