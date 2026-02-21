import mongoose, { Schema, type InferSchemaType } from "mongoose";

const paramSchema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, default: "string" },
    required: { type: Boolean, default: false },
    description: { type: String },
  },
  { _id: false }
);

const scriptSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    description: { type: String, required: true },
    code: { type: String, required: true },
    params: { type: [paramSchema], default: [] },
    createdBy: { type: String },
    version: { type: Number, default: 1 },
    isBuiltIn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type IScript = InferSchemaType<typeof scriptSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.Script) {
  mongoose.deleteModel("Script");
}

export const Script =
  mongoose.models.Script ?? mongoose.model("Script", scriptSchema);
