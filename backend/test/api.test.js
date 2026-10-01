import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
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
