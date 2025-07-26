import mongoose, { Schema, Document } from "mongoose";

export type Hotspot = Document & {
  _id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  state: string;
  county: string;
  species: number;
  createdAt: Date;
  updatedAt: Date;
};

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
