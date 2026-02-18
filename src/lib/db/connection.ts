import mongoose from "mongoose";

interface CachedConnection {
  promise: Promise<typeof mongoose> | null;
  uri: string | undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: CachedConnection | undefined;
}

const cached: CachedConnection = globalThis.__mongooseCache ?? {
  promise: null,
  uri: undefined,
};
globalThis.__mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (cached.uri !== MONGODB_URI) {
    cached.promise = null;
    cached.uri = MONGODB_URI;
  }

  if (cached.promise) {
    return cached.promise;
  }

  cached.promise = mongoose
    .connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
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
