import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { isSetupComplete } from "@/lib/auth/password";
import SetupForm from "./setup-form";

export const metadata: Metadata = {
  title: "Setup — TARS",
};

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  // No DB configured — start from database step
  if (!process.env.MONGODB_URI) {
    return <SetupForm initialStep="database" hasAnthropicKey={hasAnthropicKey} />;
  }

  // DB URI set but unreachable — start from database step
  try {
    await connectDB();
  } catch {
    return <SetupForm initialStep="database" hasAnthropicKey={hasAnthropicKey} />;
  }

  // DB connected, check if setup is already done
  if (await isSetupComplete()) {
    redirect("/login");
  }

  // DB connected but no password set yet
  return <SetupForm initialStep="password" hasAnthropicKey={hasAnthropicKey} />;
}
