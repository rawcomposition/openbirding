import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGO_URI environment variable inside .env");
}

let isConnected = false;

async function connect() {
  if (isConnected) {
    return;
  }

  if (mongoose.connection.readyState >= 1) {
    isConnected = true;
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI!);
    isConnected = true;
  } catch (error) {
    isConnected = false;
    throw error;
  }
}

export default connect;
