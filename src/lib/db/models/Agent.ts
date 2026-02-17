import mongoose, { Schema, type InferSchemaType } from "mongoose";

const machineSchema = new Schema(
  {
    hostname: { type: String },
    os: { type: String },
    cpus: { type: Number },
    memoryGb: { type: Number },
  },
  { _id: false }
);

const agentSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    url: { type: String, required: true },
    apiKey: { type: String },
    capabilities: { type: [String], default: [] },
    archetypes: { type: [String], default: [] },
    preferredArchetype: { type: String },
    defaultCwd: { type: String },
    defaultModel: { type: String },
    isLocal: { type: Boolean, default: false },
    autoStart: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastHeartbeat: { type: Date },
    machine: { type: machineSchema },
  },
  { timestamps: true }
);

agentSchema.index({ isOnline: 1, archetypes: 1 });
agentSchema.index({ isLocal: 1 });

export type IAgent = InferSchemaType<typeof agentSchema>;

export const Agent =
  mongoose.models.Agent ?? mongoose.model("Agent", agentSchema);
