import mongoose from "mongoose";

/*
 * Les octets audio sont stockés dans GridFS ; les anciens fichiers disque
 * peuvent rester référencés par storedName pendant leur migration.
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, select: false },
    audioFileId: { type: mongoose.Schema.Types.ObjectId, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    bpm: { type: Number, min: 20, max: 300, default: null },
    key: { type: String, trim: true, maxlength: 24, default: "" },
    waveform: {
      type: [{ type: Number, min: 0, max: 1 }],
      default: [],
      validate: {
        validator: (value) => value.length <= 128,
        message: "La forme d’onde ne peut pas dépasser 128 points",
      },
    },
    tuning: { type: String, trim: true, maxlength: 32, default: "" },
    genre: { type: String, trim: true, maxlength: 40, default: "" },
    level: { type: String, enum: ["debutant", "intermediaire", "avance", ""], default: "" },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  console.debug(`[track-model] Préparation de la piste publique ${this.id}`);
  return {
    id: this.id,
    ownerId: String(this.ownerId),
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    bpm: this.bpm ?? null,
    key: this.key || "",
    tuning: this.tuning || "",
    genre: this.genre || "",
    level: this.level || "",
    waveform: this.waveform || [],
    createdAt: this.createdAt,
  };
};

export const Track = mongoose.model("Track", schema);
