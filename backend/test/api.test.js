import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";
import { Playlist } from "../src/models/Playlist.js";
import { RevokedToken } from "../src/models/RevokedToken.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", async () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(t.bpm, null);
  assert.equal(t.toPublic().key, "");
  assert.equal(Track.schema.path("bpm").options.min, 20);
  assert.equal(Track.schema.path("bpm").options.max, 300);
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
  assert.equal(Playlist.schema.path("ownerId").options.ref, "User");

  const playlist = new Playlist({
    ownerId: t.ownerId,
    name: "  Répétition  ",
    trackIds: [t.id],
  });
  assert.equal(playlist.name, "Répétition");
  assert.deepEqual(playlist.toPublic().trackIds, [t.id]);

  const invalidTempo = new Track({
    ownerId: t.ownerId,
    title: "Trop rapide",
    originalName: "fast.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
    bpm: 301,
  });
  await assert.rejects(invalidTempo.validate(), (error) => {
    assert.equal(error.errors.bpm.kind, "max");
    return true;
  });

  const user = new User({
    name: "Test",
    email: "test@example.com",
    password: "12345678",
    bio: "Musicien",
    hasProfileImage: true,
    profileImage: Buffer.from("private image"),
  });
  assert.equal(user.toPublic().bio, "Musicien");
  assert.equal(user.toPublic().hasProfileImage, true);
  assert.equal(Object.hasOwn(user.toPublic(), "profileImage"), false);
  assert.ok(
    RevokedToken.schema.indexes().some(
      ([index, options]) =>
        index.expiresAt === 1 && options.expireAfterSeconds === 0,
    ),
  );
});

test("mise à jour authentifiée des analyses et métadonnées musicales", async () => {
  const originalFindOneAndUpdate = Track.findOneAndUpdate;
  const originalExists = RevokedToken.exists;
  const ownerId = new mongoose.Types.ObjectId();
  const trackId = new mongoose.Types.ObjectId();
  const expected = {
    bpm: 128,
    key: "La mineur",
    tuning: "Drop D",
    genre: "Rock",
    level: "intermediaire",
    waveform: Array.from({ length: 128 }, (_, index) => (index % 8) / 8),
  };
  Track.findOneAndUpdate = async (filter, update, options) => {
    assert.deepEqual(filter, { _id: String(trackId), ownerId: String(ownerId) });
    assert.deepEqual(update, { $set: expected });
    assert.equal(options.runValidators, true);
    return { toPublic: () => ({ id: String(trackId), ...expected }) };
  };
  RevokedToken.exists = async () => null;
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });

  try {
    const response = await fetch(`${base}/api/tracks/${trackId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expected),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: String(trackId), ...expected });
  } finally {
    Track.findOneAndUpdate = originalFindOneAndUpdate;
    RevokedToken.exists = originalExists;
  }
});

test("refuse une forme d'onde invalide et nettoie le fichier audio temporaire", async () => {
  const originalExists = RevokedToken.exists;
  const ownerId = new mongoose.Types.ObjectId();
  RevokedToken.exists = async () => null;
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });
  const uploadsPath = path.resolve("data/uploads");
  const before = await fsPromises.readdir(uploadsPath);

  try {
    const body = new FormData();
    body.append("audio", new Blob(["audio data"], { type: "audio/mpeg" }), "test.mp3");
    body.append("title", "Test");
    body.append("bpm", "120");
    body.append("key", "Do majeur");
    body.append("waveform", "[]");
    const response = await fetch(`${base}/api/tracks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${value}` },
      body,
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, "Analyse audio invalide");
    assert.deepEqual(await fsPromises.readdir(uploadsPath), before);
  } finally {
    RevokedToken.exists = originalExists;
  }
});

test("photo de profil est stockée et renvoyée depuis MongoDB", async () => {
  const originalFindById = User.findById;
  const originalExists = RevokedToken.exists;
  const ownerId = new mongoose.Types.ObjectId();
  let lookupMode = "upload";
  const user = {
    id: String(ownerId),
    profileImage: undefined,
    profileImageMimeType: undefined,
    hasProfileImage: false,
    save: async () => undefined,
    toPublic() {
      return { id: this.id, hasProfileImage: this.hasProfileImage };
    },
  };
  User.findById = () => lookupMode === "upload"
    ? Promise.resolve(user)
    : { select: async () => user };
  RevokedToken.exists = async () => null;
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });

  try {
    const body = new FormData();
    body.append("avatar", new Blob(["profile photo"], { type: "image/png" }), "avatar.png");
    const uploaded = await fetch(`${base}/api/users/me/avatar`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${value}` },
      body,
    });
    assert.equal(uploaded.status, 200);
    assert.equal(user.profileImageMimeType, "image/png");
    assert.equal(Buffer.from(user.profileImage).toString(), "profile photo");
    assert.equal((await uploaded.json()).hasProfileImage, true);

    lookupMode = "read";
    const image = await fetch(`${base}/api/users/me/avatar`, {
      headers: { Authorization: `Bearer ${value}` },
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(await image.text(), "profile photo");
  } finally {
    User.findById = originalFindById;
    RevokedToken.exists = originalExists;
  }
});

test("logout révoque le JWT et interdit sa réutilisation", async () => {
  const originalExists = RevokedToken.exists;
  const originalUpdateOne = RevokedToken.updateOne;
  const revokedHashes = new Set();
  RevokedToken.exists = async ({ tokenHash }) =>
    revokedHashes.has(tokenHash) ? { _id: tokenHash } : null;
  RevokedToken.updateOne = async ({ tokenHash }) => {
    revokedHashes.add(tokenHash);
    return { acknowledged: true, upsertedCount: 1 };
  };

  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), email: "test@example.com" },
    secret,
    { expiresIn: "2h" },
  );
  const tokenHash = crypto.createHash("sha256").update(value).digest("hex");

  try {
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${value}` },
    });
    assert.equal(logout.status, 204);
    assert.equal(revokedHashes.has(tokenHash), true);

    const reused = await fetch(`${base}/api/users/me`, {
      headers: { Authorization: `Bearer ${value}` },
    });
    assert.equal(reused.status, 401);
  } finally {
    RevokedToken.exists = originalExists;
    RevokedToken.updateOne = originalUpdateOne;
  }
});

test("suppression authentifiée efface la piste MongoDB et le fichier audio", async () => {
  const originalFindOne = Track.findOne;
  const originalDeleteOne = Track.deleteOne;
  const originalExists = RevokedToken.exists;
  const ownerId = new mongoose.Types.ObjectId();
  const trackId = new mongoose.Types.ObjectId();
  const storedName = `${crypto.randomUUID()}.mp3`;
  const audioPath = path.resolve("data/uploads", storedName);
  const track = { _id: trackId, id: String(trackId), storedName };
  const filter = { _id: trackId, ownerId: String(ownerId) };
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });

  Track.findOne = (query) => {
    assert.deepEqual(query, { _id: String(trackId), ownerId: String(ownerId) });
    return { select: async (fields) => {
      assert.equal(fields, "+storedName +audioFileId");
      return track;
    } };
  };
  Track.deleteOne = async (query) => {
    assert.deepEqual(query, filter);
    return { deletedCount: 1 };
  };
  RevokedToken.exists = async () => null;

  try {
    await fsPromises.mkdir(path.dirname(audioPath), { recursive: true });
    await fsPromises.writeFile(audioPath, "audio test");
    const response = await fetch(`${base}/api/tracks/${trackId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${value}` },
    });
    assert.equal(response.status, 204);
    assert.equal(await fsPromises.stat(audioPath).then(() => true, () => false), false);
  } finally {
    Track.findOne = originalFindOne;
    Track.deleteOne = originalDeleteOne;
    RevokedToken.exists = originalExists;
    await fsPromises.unlink(audioPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
});

test("restaure le fichier audio si la suppression MongoDB échoue", async () => {
  const originalFindOne = Track.findOne;
  const originalDeleteOne = Track.deleteOne;
  const originalExists = RevokedToken.exists;
  const ownerId = new mongoose.Types.ObjectId();
  const trackId = new mongoose.Types.ObjectId();
  const storedName = `${crypto.randomUUID()}.mp3`;
  const audioPath = path.resolve("data/uploads", storedName);
  const track = { _id: trackId, id: String(trackId), storedName };
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });

  Track.findOne = () => ({ select: async () => track });
  Track.deleteOne = async () => {
    throw new Error("Simulated database failure");
  };
  RevokedToken.exists = async () => null;

  try {
    await fsPromises.mkdir(path.dirname(audioPath), { recursive: true });
    await fsPromises.writeFile(audioPath, "audio test");
    const response = await fetch(`${base}/api/tracks/${trackId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${value}` },
    });
    assert.equal(response.status, 500);
    assert.equal(await fsPromises.readFile(audioPath, "utf8"), "audio test");
  } finally {
    Track.findOne = originalFindOne;
    Track.deleteOne = originalDeleteOne;
    RevokedToken.exists = originalExists;
    await fsPromises.unlink(audioPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
});

test("stocke un upload audio dans GridFS et le restitue avec l'autorisation du propriétaire", async () => {
  const originalCreate = Track.create;
  const originalFindOne = Track.findOne;
  const originalExists = RevokedToken.exists;
  const originalDatabase = mongoose.connection.db;
  const originalGridFSBucket = Object.getOwnPropertyDescriptor(mongoose.mongo, "GridFSBucket");
  const database = {};
  const files = new Map();
  const ownerId = new mongoose.Types.ObjectId();
  const trackId = new mongoose.Types.ObjectId();
  const secret = process.env.JWT_SECRET || "tp1-development-secret";
  const value = jwt.sign({ sub: String(ownerId) }, secret, { expiresIn: "2h" });

  class FakeGridFSBucket {
    constructor(actualDatabase, options) {
      assert.equal(actualDatabase, database);
      assert.equal(options.bucketName, "trackAudio");
    }

    openUploadStream(filename, { id, contentType, metadata }) {
      assert.equal(contentType, "audio/wav");
      assert.equal(metadata.ownerId, String(ownerId));
      const chunks = [];
      return new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
        final(callback) {
          files.set(String(id), { filename, contentType, bytes: Buffer.concat(chunks) });
          callback();
        },
      });
    }

    openDownloadStream(id) {
      return Readable.from([files.get(String(id)).bytes]);
    }
  }

  Object.defineProperty(mongoose.mongo, "GridFSBucket", {
    configurable: true,
    writable: true,
    value: FakeGridFSBucket,
  });
  mongoose.connection.db = database;
  RevokedToken.exists = async () => null;
  Track.create = async (document) => {
    assert.equal(document.ownerId, String(ownerId));
    assert.ok(document.audioFileId instanceof mongoose.Types.ObjectId);
    const stored = { ...document, id: String(trackId) };
    return {
      id: String(trackId),
      toPublic: () => ({
        id: String(trackId),
        ownerId: String(ownerId),
        title: stored.title,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
        bpm: stored.bpm,
        key: stored.key,
        tuning: stored.tuning,
        genre: stored.genre,
        level: stored.level,
        waveform: stored.waveform,
      }),
    };
  };
  Track.findOne = (query) => {
    assert.deepEqual(query, { _id: String(trackId), ownerId: String(ownerId) });
    return {
      select: async (fields) => {
        assert.equal(fields, "+storedName +audioFileId");
        return {
          id: String(trackId),
          mimeType: "audio/wav",
          audioFileId: [...files.keys()][0],
        };
      },
    };
  };

  try {
    const form = new FormData();
    form.set("audio", new Blob(["shared audio"], { type: "audio/wav" }), "sample.wav");
    form.set("title", "sample-3s-96khz.wav");
    form.set("bpm", "96");
    form.set("key", "Do majeur");
    form.set("waveform", JSON.stringify(Array.from({ length: 128 }, (_, index) => index / 128)));
    form.set("tuning", "E standard");
    form.set("genre", "Blues");
    form.set("level", "debutant");
    const upload = await fetch(`${base}/api/tracks`, {
      method: "POST",
      headers: new Headers({ authorization: ["Bearer", value].join(" ") }),
      body: form,
    });
    assert.equal(upload.status, 201);
    const uploadedTrack = await upload.json();
    assert.equal(uploadedTrack.title, "sample-3s-96khz.wav");
    assert.equal(uploadedTrack.bpm, 96);
    assert.equal(uploadedTrack.key, "Do majeur");
    assert.equal(uploadedTrack.tuning, "E standard");
    assert.equal(uploadedTrack.genre, "Blues");
    assert.equal(uploadedTrack.level, "debutant");
    assert.equal(uploadedTrack.waveform.length, 128);
    assert.equal(files.size, 1);
    assert.equal([...files.values()][0].bytes.toString(), "shared audio");

    const audio = await fetch(`${base}/api/tracks/${trackId}/audio`, {
      headers: new Headers({ authorization: ["Bearer", value].join(" ") }),
    });
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get("content-type"), "audio/wav");
    assert.equal(await audio.text(), "shared audio");
  } finally {
    Track.create = originalCreate;
    Track.findOne = originalFindOne;
    RevokedToken.exists = originalExists;
    mongoose.connection.db = originalDatabase;
    Object.defineProperty(mongoose.mongo, "GridFSBucket", originalGridFSBucket);
  }
});
