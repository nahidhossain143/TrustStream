"use strict";

const { Contract } = require("fabric-contract-api");

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

  async RegisterVideoProof(ctx, videoId, title, metadataCid, merkleRoot, totalSegments) {
    const key = this._key("video", videoId);

    if (await this._exists(ctx, key)) {
      throw new Error(`Video proof already exists: ${videoId}`);
    }

    const now = this._now(ctx);

    // The chaincode's endorsement policy is AND(Org1MSP.peer, Org2MSP.peer, Org3MSP.peer),
    // so a peer from all 3 orgs already had to simulate and sign this exact proposal
    // before the ordering service would let it commit. All three are endorsed by definition.
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
      createdBy: ctx.clientIdentity.getMSPID(),
      createdAt: now,
      updatedAt: now
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(proof)));
    this._emitRegistered(ctx, proof, merkleRoot);

    return JSON.stringify(proof);
  }

  async RegisterImageProof(ctx, imageId, title, sha256Hash, ipfsCid, metadataCid, c2paHash) {
    const key = this._key("image", imageId);

    if (await this._exists(ctx, key)) {
      throw new Error(`Image proof already exists: ${imageId}`);
    }

    const now = this._now(ctx);

    // Same reasoning as RegisterVideoProof: the AND(3-org) endorsement policy
    // already required all 3 orgs' peers to sign this proposal before commit.
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
      createdBy: ctx.clientIdentity.getMSPID(),
      createdAt: now,
      updatedAt: now
    };

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(proof)));
    this._emitRegistered(ctx, proof, sha256Hash);

    return JSON.stringify(proof);
  }

  async EndorseMedia(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);
    const orgName = this._orgName(ctx);

    proof.endorsements[orgName] = true;
    proof.updatedAt = this._now(ctx);

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(proof)));
    return JSON.stringify(proof);
  }

  async GetMediaProof(ctx, mediaType, mediaId) {
    const key = this._key(mediaType, mediaId);
    const proof = await this._readProof(ctx, key);
    return JSON.stringify(proof);
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

    await ctx.stub.putState(key, Buffer.from(JSON.stringify(proof)));

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

    return JSON.stringify(proof);
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

    return JSON.stringify({
      valid: hashMatches && !revoked,
      hashMatches,
      revoked,
      proof
    });
  }

  async VerifyImageProof(ctx, imageId, sha256Hash) {
    const proof = await this._readProof(ctx, this._key("image", imageId));

    const hashMatches =
      String(proof.sha256Hash).toLowerCase() === String(sha256Hash).toLowerCase();
    const revoked = proof.status === "revoked";

    return JSON.stringify({
      valid: hashMatches && !revoked,
      hashMatches,
      revoked,
      proof
    });
  }
}

module.exports = TrustStreamContract;
