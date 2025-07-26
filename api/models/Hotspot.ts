import mongoose, { Schema, Document } from "mongoose";
import { Hotspot as HotspotType } from "@/lib/types";

export type Hotspot = Document & HotspotType;

const HotspotSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    county: {
      type: String,
      required: true,
    },
    species: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<Hotspot>("Hotspot", HotspotSchema);
