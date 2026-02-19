import { NextRequest } from "next/server";
import { connectDB, Agent, Task, Message, Conversation } from "@/lib/db";

/**
 * POST /api/agents/tasks/webhook
 *
 * Called by remote agent servers when a task reaches a terminal status.
 * Auth: Bearer token must match the agent's apiKey.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return Response.json({ error: "Missing authorization" }, { status: 401 });
  }

  await connectDB();

  const body = await request.json();
  const {
    agentId,
    agentName,
    taskId,
    status,
    result,
    error,
    stopReason,
    costUsd,
    turnsCompleted,
    filesModified,
    lastActivity,
  } = body;

  if (!agentId || !taskId || !status) {
    return Response.json(
      { error: "agentId, taskId, and status are required" },
      { status: 400 }
    );
  }

  // Verify the token matches this agent's apiKey
  const agent = await Agent.findById(agentId).lean() as Record<string, unknown> | null;
  if (!agent || agent.apiKey !== token) {
    return Response.json({ error: "Invalid authorization" }, { status: 403 });
  }

  // Find the TARS-side task doc
  const task = await Task.findOne({ remoteTaskId: taskId, agentId });
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Update the task
  task.status = status;
  if (result !== undefined) task.result = result;
  if (error !== undefined) task.error = error;
  if (stopReason !== undefined) task.stopReason = stopReason;
  if (costUsd !== undefined) task.costUsd = costUsd;
  if (turnsCompleted !== undefined) task.turnsCompleted = turnsCompleted;
  if (filesModified !== undefined) task.filesModified = filesModified;
  if (lastActivity !== undefined) task.lastActivity = lastActivity;

  const isTerminal = ["completed", "failed", "cancelled", "max_turns", "max_budget"].includes(status);
  if (isTerminal) {
    task.completedAt = new Date();
  }

  // Update the existing agent-activity message (created at assign_task time)
  if (isTerminal && !task.notified) {
    task.notified = true;

    const activityStatus = status === "completed" ? "completed" : "failed";
    const summary = task.summary || task.prompt.slice(0, 120);

    // Try to find and update the existing message first
    const existingMsg = await Message.findOneAndUpdate(
      {
        conversationId: task.conversationId,
        role: "agent-activity",
        "agentActivity.taskId": task._id.toString(),
      },
      {
        $set: {
          "agentActivity.status": activityStatus,
          "agentActivity.completedAt": new Date(),
          "agentActivity.turnsCompleted": turnsCompleted ?? 0,
          "agentActivity.lastActivity": lastActivity ?? "",
          "agentActivity.costUsd": costUsd ?? 0,
          "agentActivity.result": result ?? null,
        },
      },
      { new: true }
    );

    // Fallback: create a new message if none was found (e.g. older tasks)
    if (!existingMsg) {
      const msg = await Message.create({
        conversationId: task.conversationId,
        role: "agent-activity",
        agentActivity: {
          agentId,
          agentName: agentName || agent.name,
          taskId: task._id.toString(),
          taskSummary: summary,
          status: activityStatus,
          steps: [],
          startedAt: task.createdAt,
          completedAt: new Date(),
          turnsCompleted: turnsCompleted ?? 0,
          lastActivity: lastActivity ?? "",
          costUsd: costUsd ?? 0,
          result: result ?? null,
        },
      });

      await Conversation.findByIdAndUpdate(task.conversationId, {
        $inc: { messageCount: 1 },
        $set: { lastMessageAt: msg.timestamp },
      });
    }
  }

  await task.save();

  return Response.json({ ok: true });
}
