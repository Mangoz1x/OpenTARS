import mongoose, { Schema, type InferSchemaType } from "mongoose";

const memorySchema = new Schema(
  {
    path: { type: String, required: true, unique: true },
    content: { type: String, default: "" },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type IMemory = InferSchemaType<typeof memorySchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.Memory) {
  mongoose.deleteModel("Memory");
}

export const Memory =
  mongoose.models.Memory ?? mongoose.model("Memory", memorySchema);
