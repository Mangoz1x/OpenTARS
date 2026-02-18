import bcrypt from "bcryptjs";
import { SiteConfig } from "@/lib/db";

const BCRYPT_ROUNDS = 12;

export async function verifyPassword(input: string): Promise<boolean> {
  const config = await SiteConfig.findOne().lean<{ passwordHash: string }>();
  if (!config) return false;
  return bcrypt.compare(input, config.passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function isSetupComplete(): Promise<boolean> {
  const count = await SiteConfig.countDocuments();
  return count > 0;
}
