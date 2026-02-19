import mongoose, { Schema, type InferSchemaType } from "mongoose";

const setupTokenSchema = new Schema(
  {
    token: { type: String, required: true, unique: true },
    agentName: { type: String, default: "TARS Agent" },
    archetypes: { type: [String], default: ["developer"] },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    usedByAgentId: { type: String, default: null },
  },
  { timestamps: true }
);

setupTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ISetupToken = InferSchemaType<typeof setupTokenSchema>;

export const SetupToken =
  mongoose.models.SetupToken ?? mongoose.model("SetupToken", setupTokenSchema);
