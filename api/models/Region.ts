import mongoose, { Schema, Document } from "mongoose";
import type { Region as RegionType } from "../lib/types.js";

export type Region = Document & RegionType;

const RegionSchema: Schema = new Schema({
  _id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  longName: String,
  parents: [
    {
      id: String,
      name: String,
      _id: false,
    },
  ],
  isCountry: Boolean,
  hasChildren: Boolean,
});

export default mongoose.model<Region>("Region", RegionSchema);
