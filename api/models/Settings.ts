import mongoose, { Schema, Document } from "mongoose";

interface SettingsType {
  lastSyncRegion?: string;
}

export type Settings = Document & SettingsType;

const SettingsSchema: Schema = new Schema(
  {
    lastSyncRegion: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<Settings>("Settings", SettingsSchema);
