import mongoose, { Schema, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
  {
    remoteTaskId: { type: String, required: true },
    agentId: { type: String, required: true },
    agentName: { type: String, required: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    prompt: { type: String, required: true },
    summary: { type: String, default: "" },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "cancelled", "max_turns", "max_budget"],
      default: "running",
    },
    result: { type: String, default: null },
    error: { type: String, default: null },
    stopReason: { type: String, default: null },
    costUsd: { type: Number, default: 0 },
    turnsCompleted: { type: Number, default: 0 },
    filesModified: { type: [String], default: [] },
    lastActivity: { type: String, default: "" },
    notified: { type: Boolean, default: false },
    responseClaimed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ remoteTaskId: 1, agentId: 1 }, { unique: true });
taskSchema.index({ conversationId: 1 });
taskSchema.index({ status: 1, createdAt: -1 });

export type ITask = InferSchemaType<typeof taskSchema>;

// Force re-register in development to pick up schema changes during hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.Task) {
  mongoose.deleteModel("Task");
}

export const Task =
  mongoose.models.Task ?? mongoose.model("Task", taskSchema);
