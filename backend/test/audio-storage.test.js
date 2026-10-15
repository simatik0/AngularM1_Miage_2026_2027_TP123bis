import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import mongoose from "mongoose";
import { migrateLegacyAudio, storeAudioFile } from "../src/audio-storage.js";

let files;
let temporaryDirectory;

class FakeGridFSBucket {
  openUploadStream(filename, { id }) {
    const chunks = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
      final(callback) {
        files.set(String(id), { filename, data: Buffer.concat(chunks) });
        callback();
      },
    });
    return writable;
  }

  openDownloadStream(id) {
    return Readable.from([files.get(String(id)).data]);
  }

  async delete(id) {
    files.delete(String(id));
  }
}

beforeEach(async () => {
  files = new Map();
  temporaryDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "gpc-audio-test-"));
});

afterEach(async () => {
  await fsPromises.rm(temporaryDirectory, { recursive: true, force: true });
});

test("stocke les octets audio dans GridFS et retire le fichier temporaire", async () => {
  const sourcePath = path.join(temporaryDirectory, "upload.mp3");
  await fsPromises.writeFile(sourcePath, "persisted audio");

  const fileId = await storeAudioFile({
    filename: "upload.mp3",
    mimetype: "audio/mpeg",
    path: sourcePath,
  }, "demo-user", { bucket: new FakeGridFSBucket() });

  assert.equal(files.get(String(fileId)).data.toString(), "persisted audio");
  await assert.rejects(fsPromises.access(sourcePath), { code: "ENOENT" });
});

test("migre un ancien fichier local dans GridFS et met à jour sa piste", async () => {
  const storedName = "legacy.wav";
  const sourcePath = path.join(temporaryDirectory, storedName);
  await fsPromises.writeFile(sourcePath, "legacy audio");
  const track = {
    id: "track-1",
    ownerId: "demo-user",
    storedName,
    mimeType: "audio/wav",
    audioFileId: undefined,
    async save() {},
  };
  const model = {
    find(query) {
      assert.deepEqual(query, {
        audioFileId: { $exists: false },
        storedName: { $type: "string" },
      });
      return {
        async select(fields) {
          assert.equal(fields, "+storedName +audioFileId");
          return [track];
        },
      };
    },
  };

  await migrateLegacyAudio(model, temporaryDirectory, { bucket: new FakeGridFSBucket() });

  assert.ok(track.audioFileId instanceof mongoose.Types.ObjectId);
  assert.equal(files.get(String(track.audioFileId)).data.toString(), "legacy audio");
  await assert.rejects(fsPromises.access(sourcePath), { code: "ENOENT" });
});
