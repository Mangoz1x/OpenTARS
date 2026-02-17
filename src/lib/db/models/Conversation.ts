import mongoose, { Schema, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema(
  {
    title: { type: String },
    orchestratorSessionId: { type: String },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ orchestratorSessionId: 1 });

export type IConversation = InferSchemaType<typeof conversationSchema>;

export const Conversation =
  mongoose.models.Conversation ??
  mongoose.model("Conversation", conversationSchema);
