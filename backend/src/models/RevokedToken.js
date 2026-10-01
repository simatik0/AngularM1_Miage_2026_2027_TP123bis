import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = mongoose.model("RevokedToken", schema);
