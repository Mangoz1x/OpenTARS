import mongoose, { Schema, type InferSchemaType } from "mongoose";

const agentStepSchema = new Schema(
  {
    label: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "failed"],
      required: true,
    },
  },
  { _id: false }
);

const agentActivitySchema = new Schema(
  {
    agentId: { type: String },
    agentName: { type: String, required: true },
    taskId: { type: String },
    taskSummary: { type: String, required: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      required: true,
    },
    steps: { type: [agentStepSchema], default: [] },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { _id: false }
);

const statusInfoSchema = new Schema(
  {
    level: {
      type: String,
      enum: ["info", "warning", "error", "success"],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    stopReason: { type: String },
    errorType: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const userQuestionOptionSchema = new Schema(
  {
    label: { type: String, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const userQuestionItemSchema = new Schema(
  {
    header: { type: String, required: true },
    question: { type: String, required: true },
    options: { type: [userQuestionOptionSchema], default: [] },
    multiSelect: { type: Boolean, default: false },
  },
  { _id: false }
);

const userQuestionSchema = new Schema(
  {
    questions: { type: [userQuestionItemSchema], default: [] },
    answered: { type: Boolean, default: false },
    answers: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const toolUseSchema = new Schema(
  {
    toolName: { type: String, required: true },
    detail: { type: String },
  },
  { _id: false }
);

const citationSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, required: true },
    citedText: { type: String },
  },
  { _id: false }
);

const messageSchema = new Schema({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  role: {
    type: String,
    enum: ["user", "assistant", "agent-activity", "status", "user-question", "tool-use"],
    required: true,
  },
  content: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
  agentActivity: { type: agentActivitySchema },
  statusInfo: { type: statusInfoSchema },
  userQuestion: { type: userQuestionSchema },
  citations: { type: [citationSchema] },
  toolUse: { type: toolUseSchema },
});

messageSchema.index({ conversationId: 1, timestamp: 1 });

export type IMessage = InferSchemaType<typeof messageSchema>;

// Force re-register in development to pick up schema changes during hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.Message) {
  mongoose.deleteModel("Message");
}

export const Message =
  mongoose.models.Message ?? mongoose.model("Message", messageSchema);
