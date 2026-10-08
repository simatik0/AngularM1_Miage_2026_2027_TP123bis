import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";
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

test("schémas Mongoose et relation", () => {
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
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
  assert.ok(
    RevokedToken.schema.indexes().some(
      ([index, options]) =>
        index.expiresAt === 1 && options.expireAfterSeconds === 0,
    ),
  );
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
      assert.equal(fields, "+storedName");
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
