import mongoose, { Schema, type InferSchemaType } from "mongoose";

const dataStoreSchema = new Schema(
  {
    store: { type: String, required: true },
    key: { type: String },
    data: { type: Schema.Types.Mixed },
    createdBy: { type: String },
  },
  { timestamps: true }
);

dataStoreSchema.index({ store: 1, key: 1 }, { unique: true, sparse: true });
dataStoreSchema.index({ store: 1, createdAt: -1 });

export type IDataStore = InferSchemaType<typeof dataStoreSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.DataStore) {
  mongoose.deleteModel("DataStore");
}

export const DataStore =
  mongoose.models.DataStore ?? mongoose.model("DataStore", dataStoreSchema);
