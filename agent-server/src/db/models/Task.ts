import mongoose, { Schema, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
  {
    _id: { type: String },
    agentId: { type: String, required: true },
    sessionId: { type: String, default: null },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "cancelled", "max_turns", "max_budget"],
      required: true,
    },
    prompt: { type: String, required: true },
    systemPrompt: { type: String, default: "" },
    turnsCompleted: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    lastActivity: { type: String, default: "" },
    activities: { type: [String], default: [] },
    result: { type: String, default: null },
    stopReason: { type: String, default: null },
    filesModified: { type: [String], default: [] },
    error: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ agentId: 1, status: 1 });
taskSchema.index({ createdAt: -1 });

export type ITask = InferSchemaType<typeof taskSchema>;

export const Task =
  mongoose.models.Task ?? mongoose.model("Task", taskSchema);
