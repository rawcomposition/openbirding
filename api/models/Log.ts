import mongoose, { Schema, Document } from "mongoose";

interface LogType {
  user: string;
  type: string;
  message: string;
}

export type Log = Document & LogType;

const LogSchema: Schema = new Schema(
  {
    user: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<Log>("Log", LogSchema);
