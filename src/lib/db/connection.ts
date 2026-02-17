import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

interface CachedConnection {
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: CachedConnection | undefined;
}

const cached: CachedConnection = globalThis.__mongooseCache ?? {
  promise: null,
};
globalThis.__mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (cached.promise) {
    return cached.promise;
  }

  cached.promise = mongoose
    .connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    .then((m) => {
      console.log("[MongoDB] Connected");
      return m;
    })
    .catch((err) => {
      cached.promise = null;
      throw err;
    });

  return cached.promise;
}
