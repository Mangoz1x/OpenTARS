import mongoose, { Schema, type InferSchemaType } from "mongoose";

const extensionSchema = new Schema(
  {
    _id: { type: String },
    displayName: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "disabled", "error"],
      default: "active",
    },
    componentSource: { type: String },
    props: { type: Schema.Types.Mixed },
    scripts: { type: [String], default: [] },
    stores: { type: [String], default: [] },
    createdBy: { type: String },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export type IExtension = InferSchemaType<typeof extensionSchema>;

if (process.env.NODE_ENV !== "production" && mongoose.models.Extension) {
  mongoose.deleteModel("Extension");
}

export const Extension =
  mongoose.models.Extension ?? mongoose.model("Extension", extensionSchema);
