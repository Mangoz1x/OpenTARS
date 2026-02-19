import mongoose from "mongoose";

let connectionPromise: Promise<typeof mongoose> | null = null;
let connectedUri: string | undefined;

export async function connectDB(uri: string): Promise<typeof mongoose> {
  if (connectedUri !== uri) {
    connectionPromise = null;
    connectedUri = uri;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(uri, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
    })
    .then((m) => {
      console.log("[MongoDB] Connected");
      return m;
    })
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}
