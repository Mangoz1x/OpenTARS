import mongoose, { Schema, type InferSchemaType } from "mongoose";

const siteConfigSchema = new Schema(
  {
    passwordHash: { type: String, required: true },
    anthropicApiKey: { type: String },
    atlasPublicKey: { type: String },
    atlasPrivateKey: { type: String },
    atlasGroupId: { type: String },
  },
  { timestamps: true }
);

export type ISiteConfig = InferSchemaType<typeof siteConfigSchema>;

export const SiteConfig =
  mongoose.models.SiteConfig ?? mongoose.model("SiteConfig", siteConfigSchema);
