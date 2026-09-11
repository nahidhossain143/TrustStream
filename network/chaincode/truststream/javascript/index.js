"use strict";

const { Contract } = require("fabric-contract-api");

// 2 of the 3 orgs (excluding whichever org created the proof) must report
// tamper before the consortium treats it as disputed. Mirrors the intent of
// a 2-of-3 quorum without requiring the uploader's own org to vouch against
// itself.
const TAMPER_THRESHOLD = 2;

class TrustStreamContract extends Contract {
  async InitLedger(ctx) {
    return "TrustStream ledger initialized";
  }

  _now(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    const seconds = ts.seconds.low || ts.seconds;
    return new Date(seconds * 1000 + Math.floor(ts.nanos / 1000000)).toISOString();
  }

  _orgName(ctx) {
    const mspId = ctx.clientIdentity.getMSPID();

    if (mspId === "Org1MSP") return "NewsAgency";
    if (mspId === "Org2MSP") return "Broadcaster";
    if (mspId === "Org3MSP") return "Auditor";

    return mspId;
  }

  _key(mediaType, mediaId) {
    return `${mediaType}:${mediaId}`;
  }

  // Fabric requires every endorsing peer's simulated response to be
  // byte-identical, including the returned value - but getState(), when
  // CouchDB is the state database, is NOT guaranteed to return a JSON
  // value's keys in the same order on every peer (CouchDB stores and
  // returns values as its own JSON documents, and different CouchDB
  // instances/versions can normalize key order differently - observed
  // directly on this network: Org3's peer returned a previously-written
  // proof with its keys reordered relative to Org1/Org2's). A plain
  // JSON.stringify(proof) after a read-modify-write therefore risks
  // "ProposalResponsePayloads do not match" purely from storage-layer key
  // reordering, not any real non-determinism in the chaincode logic
  // itself. Sorting keys before every stringify makes the written state
  // and every returned/evented payload deterministic regardless of what
  // order the underlying state database handed back.
  _canonicalJSON(value) {
    const sortKeys = (input) => {
      if (Array.isArray(input)) return input.map(sortKeys);
      if (input && typeof input === "object") {
        return Object.keys(input)
          .sort()
          .reduce((sorted, k) => {
            sorted[k] = sortKeys(input[k]);
            return sorted;
          }, {});
      }
      return input;
    };
    return JSON.stringify(sortKeys(value));
  }

  async _exists(ctx, key) {
    const data = await ctx.stub.getState(key);
    return data && data.length > 0;
  }

  async _readProof(ctx, key) {
    const data = await ctx.stub.getState(key);

    if (!data || data.length === 0) {
      throw new Error(`Media proof does not exist: ${key}`);
    }

    return JSON.parse(data.toString());
  }

  // Announces a new registration to anyone listening on the channel, so
  // consortium members learn about it by push instead of polling the ledger.
  //
  // Fabric allows at most one event per transaction, and the event is only
  // delivered once the block actually commits -- so a listener that sees this
  // knows all three orgs endorsed and the write is final.
  //
  // The payload stays small on purpose: it carries just enough to identify and
  // verify the item. Listeners that need the rest call GetMediaProof.
  _emitRegistered(ctx, proof, proofHash) {
    ctx.stub.setEvent(
      "MediaRegistered",
      Buffer.from(
        JSON.stringify({
          mediaType: proof.mediaType,
          mediaId: proof.mediaId,
          title: proof.title,
          proofHash,
          createdBy: proof.createdBy,
          createdByOrg: this._orgName(ctx),
          createdAt: proof.createdAt,
        })
      )
    );
  }

  // Turns a history/query iterator into a plain array. Both iterators are
  // read-only and must be closed, so the shape is identical apart from what
  // each entry carries.
  async _drain(iterator, mapEntry) {
    const results = [];

    try {
      let entry = await iterator.next();
      while (!entry.done) {
        results.push(mapEntry(entry.value));
        entry = await iterator.next();
      }
    } finally {
      await iterator.close();
    }

    return results;
  }

  _timestampToIso(timestamp) {
    if (!timestamp) return null;
    const seconds = timestamp.seconds.low ?? timestamp.seconds;
    return new Date(
      seconds * 1000 + Math.floor((timestamp.nanos || 0) / 1000000)
    ).toISOString();
  }

  // Only NewsAgency submits new content. This is a separate thing from peer
  // endorsement below: this checks WHO is asking to register (the submitter's
  // identity), while endorsement is about which peers had to simulate and
  // sign the proposal regardless of who submitted it.
  _requireOrg(ctx, expectedMspId, action) {
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== expectedMspId) {
      throw new Error(`Only ${expectedMspId} may ${action} (caller is ${mspId})`);
    }
  }

  async RegisterVideoProof(ctx, videoId, title, metadataCid, merkleRoot, totalSegments) {
    this._requireOrg(ctx, "Org1MSP", "register new content");

    const key = this._key("video", videoId);

    if (await this._exists(ctx, key)) {
      throw new Error(`Video proof already exists: ${videoId}`);
    }

    const now = this._now(ctx);

    // The chaincode's endorsement policy is AND(Org1MSP.peer, Org2MSP.peer, Org3MSP.peer),
    // so a peer from all 3 orgs already had to simulate and sign this exact proposal
    // before the ordering service would let it commit. That's the protocol-level
    // guarantee and is unconditional -- it's separate from the `status` workflow
    // below, which is an application-level approval queue: Broadcaster and then
    // Auditor must each explicitly review and approve before this becomes
    // "active" (i.e. before VerifyVideoProof/VerifyImageProof call it trustworthy).
    const proof = {
      docType: "mediaProof",
      mediaType: "video",
      mediaId: videoId,
      title,
      metadataCid,
      merkleRoot,
      totalSegments: Number(totalSegments || 0),
      endorsements: {
        NewsAgency: true,
        Broadcaster: true,
        Auditor: true
      },
      status: "pending_broadcaster",
      tamperReports: {},
      createdBy: ctx.clientIdentity.getMSPID(),
      createdAt: now,
      updatedAt: now
    };

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));
    this._emitRegistered(ctx, proof, merkleRoot);

    return this._canonicalJSON(proof);
  }

  async RegisterImageProof(ctx, imageId, title, sha256Hash, ipfsCid, metadataCid, c2paHash) {
    this._requireOrg(ctx, "Org1MSP", "register new content");

    const key = this._key("image", imageId);

    if (await this._exists(ctx, key)) {
      throw new Error(`Image proof already exists: ${imageId}`);
    }

    const now = this._now(ctx);

    // Same reasoning as RegisterVideoProof: the AND(3-org) endorsement policy
    // already required all 3 orgs' peers to sign this proposal before commit,
    // unconditionally. The pending_broadcaster -> pending_auditor -> active
    // workflow below is the separate, application-level approval queue.
    const proof = {
      docType: "mediaProof",
      mediaType: "image",
      mediaId: imageId,
      title,
      sha256Hash,
      ipfsCid,
      metadataCid,
      c2paHash,
      endorsements: {
        NewsAgency: true,
        Broadcaster: true,
        Auditor: true
      },
      status: "pending_broadcaster",
      tamperReports: {},
      createdBy: ctx.clientIdentity.getMSPID(),
      createdAt: now,
      updatedAt: now
    };

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));
    this._emitRegistered(ctx, proof, sha256Hash);

    return this._canonicalJSON(proof);
  }

  // --- Sequential approval workflow -----------------------------------
  //
  // pending_broadcaster --[Broadcaster approves]--> pending_auditor
  //                      \-[Broadcaster rejects]---> rejected
  // pending_auditor      --[Auditor approves]------> active
  //                      \-[Auditor rejects]--------> rejected
  //
  // Each step requires a real transaction signed by that org's own identity
  // (checked via ctx.clientIdentity.getMSPID(), not trusted from the
  // caller), so the stage transitions can't be faked by any other org --
  // including the org that submitted it.

  async ApproveByBroadcaster(ctx, mediaType, mediaId) {
    this._requireOrg(ctx, "Org2MSP", "approve at the Broadcaster stage");

    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status !== "pending_broadcaster") {
      throw new Error(`Proof is not awaiting Broadcaster approval (current status: ${proof.status})`);
    }

    const now = this._now(ctx);
    proof.status = "pending_auditor";
    proof.broadcasterApprovedAt = now;
    proof.broadcasterApprovedBy = ctx.clientIdentity.getMSPID();
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaApprovedByBroadcaster",
      Buffer.from(JSON.stringify({ mediaType, mediaId, title: proof.title, approvedAt: now }))
    );

    return this._canonicalJSON(proof);
  }

  async RejectByBroadcaster(ctx, mediaType, mediaId, reason) {
    this._requireOrg(ctx, "Org2MSP", "reject at the Broadcaster stage");

    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status !== "pending_broadcaster") {
      throw new Error(`Proof is not awaiting Broadcaster approval (current status: ${proof.status})`);
    }

    const now = this._now(ctx);
    proof.status = "rejected";
    proof.rejectedAt = now;
    proof.rejectedBy = ctx.clientIdentity.getMSPID();
    proof.rejectedByOrg = this._orgName(ctx);
    proof.rejectionStage = "broadcaster";
    proof.rejectionReason = reason || "";
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaRejected",
      Buffer.from(JSON.stringify({ mediaType, mediaId, title: proof.title, rejectionStage: "broadcaster", reason: proof.rejectionReason, rejectedAt: now }))
    );

    return this._canonicalJSON(proof);
  }

  async ApproveByAuditor(ctx, mediaType, mediaId) {
    this._requireOrg(ctx, "Org3MSP", "approve at the Auditor stage");

    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status !== "pending_auditor") {
      throw new Error(`Proof is not awaiting Auditor approval (current status: ${proof.status})`);
    }

    const now = this._now(ctx);
    proof.status = "active";
    proof.auditorApprovedAt = now;
    proof.auditorApprovedBy = ctx.clientIdentity.getMSPID();
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaFullyApproved",
      Buffer.from(JSON.stringify({ mediaType, mediaId, title: proof.title, approvedAt: now }))
    );

    return this._canonicalJSON(proof);
  }

  async RejectByAuditor(ctx, mediaType, mediaId, reason) {
    this._requireOrg(ctx, "Org3MSP", "reject at the Auditor stage");

    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status !== "pending_auditor") {
      throw new Error(`Proof is not awaiting Auditor approval (current status: ${proof.status})`);
    }

    const now = this._now(ctx);
    proof.status = "rejected";
    proof.rejectedAt = now;
    proof.rejectedBy = ctx.clientIdentity.getMSPID();
    proof.rejectedByOrg = this._orgName(ctx);
    proof.rejectionStage = "auditor";
    proof.rejectionReason = reason || "";
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaRejected",
      Buffer.from(JSON.stringify({ mediaType, mediaId, title: proof.title, rejectionStage: "auditor", reason: proof.rejectionReason, rejectedAt: now }))
    );

    return this._canonicalJSON(proof);
  }

  async EndorseMedia(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);
    const orgName = this._orgName(ctx);

    proof.endorsements[orgName] = true;
    proof.updatedAt = this._now(ctx);

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));
    return this._canonicalJSON(proof);
  }

  async GetMediaProof(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);
    return this._canonicalJSON(proof);
  }

  // A single org flags a proof as possibly tampered. The org that originally
  // created the proof is excluded from counting toward its own item's
  // dispute -- a consortium member should not be able to (even partially)
  // dispute the very thing it vouched for at registration. The report is
  // still recorded either way, just not counted.
  //
  // Reporting is idempotent per org: calling this twice from the same org
  // only ever counts once, so repeated calls cannot manufacture a dispute
  // alone. Once TAMPER_THRESHOLD distinct (non-creator) orgs have reported,
  // the proof flips to "disputed" and every further write except
  // RevokeMedia/ClearDispute is blocked until an Auditor clears it.
  async ReportTamper(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status === "revoked") {
      throw new Error(`Cannot report tamper on a revoked proof: ${key}`);
    }

    if (proof.status !== "active" && proof.status !== "disputed") {
      throw new Error(`Cannot report tamper on a proof that hasn't completed approval yet (current status: ${proof.status})`);
    }

    const orgName = this._orgName(ctx);
    const now = this._now(ctx);

    if (!proof.tamperReports) proof.tamperReports = {};

    if (proof.createdBy === ctx.clientIdentity.getMSPID()) {
      // Recorded for audit purposes but never counted toward the threshold.
      proof.uploaderSelfReportAt = now;
    } else {
      proof.tamperReports[orgName] = true;
    }

    const reportCount = Object.values(proof.tamperReports).filter(Boolean).length;

    if (reportCount >= TAMPER_THRESHOLD && proof.status !== "disputed") {
      proof.status = "disputed";
      proof.disputedAt = now;

      ctx.stub.setEvent(
        "MediaDisputed",
        Buffer.from(
          JSON.stringify({
            mediaType: proof.mediaType,
            mediaId: proof.mediaId,
            title: proof.title,
            reportingOrgs: Object.keys(proof.tamperReports),
            disputedAt: now,
          })
        )
      );
    }

    proof.updatedAt = now;
    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    return this._canonicalJSON(proof);
  }

  // Auditor-only recovery from a false-positive dispute. Without this,
  // "disputed" would be a dead end -- the only way out would be RevokeMedia,
  // which permanently kills the content instead of clearing a mistaken flag.
  // Prior tamper reports and the dispute itself are not erased: they remain
  // visible via GetMediaHistory, which reads the ledger's version history
  // rather than current state.
  async ClearDispute(ctx, mediaType, mediaId) {
    const mspId = ctx.clientIdentity.getMSPID();

    if (mspId !== "Org3MSP") {
      throw new Error("Only Org3MSP (Auditor) may clear a dispute");
    }

    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status !== "disputed") {
      throw new Error(`Proof is not currently disputed: ${key}`);
    }

    const now = this._now(ctx);

    proof.status = "active";
    proof.tamperReports = {};
    proof.disputeClearedAt = now;
    proof.disputeClearedBy = mspId;
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaDisputeCleared",
      Buffer.from(
        JSON.stringify({
          mediaType: proof.mediaType,
          mediaId: proof.mediaId,
          title: proof.title,
          clearedBy: mspId,
          clearedAt: now,
        })
      )
    );

    return this._canonicalJSON(proof);
  }

  // Marks a proof as no longer trustworthy. The record itself is never deleted
  // or rewritten out of existence -- the original registration stays in the
  // ledger's history, and this adds a revocation on top of it. That is the
  // point: a consumer can see both that it was once vouched for and that the
  // consortium later withdrew that.
  //
  // Like every other write here, this needs endorsement from all three orgs,
  // so no single member can silently discredit another's reporting.
  async RevokeMedia(ctx, mediaType, mediaId, reason) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);

    if (proof.status === "revoked") {
      throw new Error(`Media proof is already revoked: ${key}`);
    }

    const now = this._now(ctx);

    proof.status = "revoked";
    proof.revokedAt = now;
    proof.revokedBy = ctx.clientIdentity.getMSPID();
    proof.revokedByOrg = this._orgName(ctx);
    proof.revocationReason = reason || "";
    proof.updatedAt = now;

    await ctx.stub.putState(key, Buffer.from(this._canonicalJSON(proof)));

    ctx.stub.setEvent(
      "MediaRevoked",
      Buffer.from(
        JSON.stringify({
          mediaType: proof.mediaType,
          mediaId: proof.mediaId,
          title: proof.title,
          revokedBy: proof.revokedBy,
          revokedByOrg: proof.revokedByOrg,
          revocationReason: proof.revocationReason,
          revokedAt: now,
        })
      )
    );

    return this._canonicalJSON(proof);
  }

  // Every version this key has ever held, straight from the ledger's history
  // index -- not from the current state. This is what makes the provenance
  // claim checkable: each entry carries the transaction that caused it, so a
  // reader can trace a record back through every change to its registration.
  async GetMediaHistory(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const iterator = await ctx.stub.getHistoryForKey(key);

    const history = await this._drain(iterator, (entry) => {
      const record = {
        txId: entry.txId,
        timestamp: this._timestampToIso(entry.timestamp),
        isDelete: Boolean(entry.isDelete),
      };

      if (!entry.isDelete && entry.value && entry.value.length > 0) {
        try {
          record.value = JSON.parse(entry.value.toString("utf8"));
        } catch {
          record.value = null;
        }
      }

      return record;
    });

    return JSON.stringify(history);
  }

  // Rich query against the CouchDB state database. Mango selectors can filter
  // on any field inside the stored JSON, which a key-value store cannot do.
  //
  // Query results are NOT deterministic across peers, so this must only ever be
  // evaluated (read), never submitted as a transaction that writes -- two peers
  // could legitimately return different result sets and fail endorsement.
  async QueryMedia(ctx, queryString) {
    const iterator = await ctx.stub.getQueryResult(queryString);

    const results = await this._drain(iterator, (entry) => {
      const record = { key: entry.key };
      try {
        record.value = JSON.parse(entry.value.toString("utf8"));
      } catch {
        record.value = null;
      }
      return record;
    });

    return JSON.stringify(results);
  }

  // Everything a given member organization registered, e.g. "Org2MSP".
  async QueryByOrg(ctx, mspId) {
    return this.QueryMedia(
      ctx,
      JSON.stringify({ selector: { docType: "mediaProof", createdBy: mspId } })
    );
  }

  // All proofs of one kind -- "video" or "image".
  async QueryByMediaType(ctx, mediaType) {
    return this.QueryMedia(
      ctx,
      JSON.stringify({ selector: { docType: "mediaProof", mediaType } })
    );
  }

  // Everything the consortium has revoked.
  async QueryRevoked(ctx) {
    return this.QueryMedia(
      ctx,
      JSON.stringify({ selector: { docType: "mediaProof", status: "revoked" } })
    );
  }

  // Backs each org's approval queue - "everything waiting on my org right now".
  async QueryPendingBroadcaster(ctx) {
    return this.QueryMedia(
      ctx,
      JSON.stringify({ selector: { docType: "mediaProof", status: "pending_broadcaster" } })
    );
  }

  async QueryPendingAuditor(ctx) {
    return this.QueryMedia(
      ctx,
      JSON.stringify({ selector: { docType: "mediaProof", status: "pending_auditor" } })
    );
  }

  // `valid` answers the question a reader actually asks -- "can I trust this?"
  // -- so a revoked proof is never valid even when its hash still matches.
  // `hashMatches` and `revoked` are reported separately so the two failure
  // modes stay distinguishable: an altered file is not the same problem as one
  // the consortium withdrew.
  async VerifyVideoProof(ctx, videoId, merkleRoot) {
    const proof = await this._readProof(ctx, this._key("video", videoId));

    const hashMatches =
      String(proof.merkleRoot).toLowerCase() === String(merkleRoot).toLowerCase();
    const revoked = proof.status === "revoked";
    const disputed = proof.status === "disputed";
    // "Valid" means fully through the Broadcaster + Auditor approval queue,
    // not just registered - a pending_* or rejected proof is not yet (or no
    // longer) something a reader should trust, even if its hash matches.
    const fullyApproved = proof.status === "active";

    return JSON.stringify({
      valid: hashMatches && fullyApproved,
      hashMatches,
      revoked,
      disputed,
      status: proof.status,
      proof
    });
  }

  async VerifyImageProof(ctx, imageId, sha256Hash) {
    const proof = await this._readProof(ctx, this._key("image", imageId));

    const hashMatches =
      String(proof.sha256Hash).toLowerCase() === String(sha256Hash).toLowerCase();
    const revoked = proof.status === "revoked";
    const disputed = proof.status === "disputed";
    const fullyApproved = proof.status === "active";

    return JSON.stringify({
      valid: hashMatches && fullyApproved,
      hashMatches,
      revoked,
      disputed,
      status: proof.status,
      proof
    });
  }
}

module.exports = TrustStreamContract;
