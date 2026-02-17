import mongoose, { Schema, type InferSchemaType } from "mongoose";

const exampleSchema = new Schema(
  {
    task: { type: String, required: true },
    expectedBehavior: { type: String, required: true },
  },
  { _id: false }
);

const archetypeSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    description: { type: String, required: true },
    capabilities: { type: [String], default: [] },
    systemPrompt: { type: String, required: true },
    allowedTools: { type: [String], default: [] },
    permissionMode: {
      type: String,
      enum: ["default", "acceptEdits", "bypassPermissions"],
      default: "default",
    },
    defaultMaxTurns: { type: Number, default: 50 },
    defaultMaxBudgetUsd: { type: Number, default: 5.0 },
    taskPromptTemplate: { type: String },
    examples: { type: [exampleSchema], default: [] },
    isBuiltIn: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

archetypeSchema.index({ capabilities: 1 });
archetypeSchema.index({ isBuiltIn: 1 });

export type IArchetype = InferSchemaType<typeof archetypeSchema>;

export const Archetype =
  mongoose.models.Archetype ?? mongoose.model("Archetype", archetypeSchema);
