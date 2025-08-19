import mongoose, { Schema, Document } from "mongoose";
import type { Hotspot as HotspotType } from "../lib/types.js";

export type Hotspot = Document & HotspotType;

const HotspotSchema: Schema = new Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  species: {
    type: Number,
    default: 0,
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  updatedAt: Date,
  tags: [String],
});

HotspotSchema.index({ location: "2dsphere" });
HotspotSchema.index({ species: -1 });
HotspotSchema.index({ region: 1 });

export default mongoose.model<Hotspot>("Hotspot", HotspotSchema);
