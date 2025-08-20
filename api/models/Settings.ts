import mongoose, { Schema, Document } from "mongoose";

type SettingsType = {
  regionSyncTimestamps?: Record<string, number>;
};

export type Settings = Document & SettingsType;

const SettingsSchema: Schema = new Schema(
  {
    regionSyncTimestamps: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<Settings>("Settings", SettingsSchema);
