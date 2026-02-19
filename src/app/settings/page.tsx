import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { connectDB, Agent, Archetype } from "@/lib/db";
import SettingsPage from "./settings-page";

export default async function Settings() {
  const session = await getSession();
  if (!session) redirect("/login");

  await connectDB();

  const [agents, archetypes] = await Promise.all([
    Agent.find().sort({ isLocal: -1, createdAt: 1 }).lean(),
    Archetype.find().sort({ isBuiltIn: -1, name: 1 }).lean(),
  ]);

  return (
    <SettingsPage
      initialAgents={JSON.parse(JSON.stringify(agents))}
      archetypes={JSON.parse(JSON.stringify(archetypes))}
    />
  );
}
