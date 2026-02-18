import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connectDB } from "@/lib/db";
import { isSetupComplete } from "@/lib/auth/password";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Login — TARS",
};

export default async function LoginPage() {
  if (!process.env.MONGODB_URI) {
    redirect("/setup");
  }

  try {
    await connectDB();
  } catch {
    redirect("/setup");
  }

  if (!(await isSetupComplete())) {
    redirect("/setup");
  }

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
