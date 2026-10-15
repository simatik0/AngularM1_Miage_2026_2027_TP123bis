import mongoose from "mongoose";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const BUCKET_NAME = "trackAudio";

export function getAudioBucket(database = mongoose.connection.db) {
  if (!database) {
    throw new Error("MongoDB doit être connecté avant d'accéder aux fichiers audio");
  }
  return new mongoose.mongo.GridFSBucket(database, { bucketName: BUCKET_NAME });
}

export async function storeAudioFile(file, ownerId, { removeSource = true, bucket } = {}) {
  const fileId = new mongoose.Types.ObjectId();
  const audioBucket = bucket ?? getAudioBucket();
  const upload = audioBucket.openUploadStream(file.filename, {
    id: fileId,
    contentType: file.mimetype,
    metadata: { ownerId: String(ownerId) },
  });

  try {
    await pipeline(fs.createReadStream(file.path), upload);
    if (removeSource) await fsPromises.unlink(file.path);
    return fileId;
  } catch (error) {
    try {
      await audioBucket.delete(fileId);
    } catch (cleanupError) {
      if (cleanupError?.codeName !== "FileNotFound") {
        console.error(`[audio-storage] Impossible de nettoyer le fichier ${fileId}`, cleanupError);
      }
    }
    throw error;
  }
}

export async function migrateLegacyAudio(Track, uploadsDirectory, { bucket } = {}) {
  const legacyTracks = await Track.find({
    audioFileId: { $exists: false },
    storedName: { $type: "string" },
  }).select("+storedName +audioFileId");

  for (const track of legacyTracks) {
    if (!track.storedName || track.storedName !== track.storedName.split(/[\\/]/).pop()) {
      console.error(`[audio-storage] Nom de fichier historique invalide pour ${track.id}`);
      continue;
    }

    const filePath = path.join(uploadsDirectory, track.storedName);
    try {
      await fsPromises.access(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        console.warn(`[audio-storage] Fichier historique absent, migration impossible pour ${track.id}`);
        continue;
      }
      throw error;
    }

    const audioFileId = await storeAudioFile({
      filename: track.storedName,
      mimetype: track.mimeType,
      path: filePath,
    }, track.ownerId, { removeSource: false, bucket });
    try {
      track.audioFileId = audioFileId;
      await track.save();
    } catch (error) {
      try {
        await (bucket ?? getAudioBucket()).delete(audioFileId);
      } catch (cleanupError) {
        console.error(`[audio-storage] Impossible de nettoyer la migration ${track.id}`, cleanupError);
      }
      throw error;
    }
    try {
      await fsPromises.unlink(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.error(`[audio-storage] Audio migré mais copie locale conservée pour ${track.id}`, error);
      }
    }
    console.info(`[audio-storage] Ancien fichier migré vers MongoDB : ${track.id}`);
  }
}
