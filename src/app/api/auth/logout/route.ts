import { deleteSession } from "@/lib/auth/session";

export async function POST() {
  await deleteSession();
  return Response.json({ success: true });
}
