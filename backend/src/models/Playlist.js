import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    trackIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Track" }],
  },
  { timestamps: true },
);

schema.index({ ownerId: 1, createdAt: -1 });

schema.methods.toPublic = function () {
  return {
    id: this.id,
    name: this.name,
    trackIds: this.trackIds.map(String),
    createdAt: this.createdAt,
  };
};

export const Playlist = mongoose.model("Playlist", schema);
