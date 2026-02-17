/**
 * Shared in-memory store for pending AskUserQuestion answers.
 *
 * When the model calls AskUserQuestion, canUseTool blocks on a Promise.
 * The SSE stream handler stores the resolver here, and the /answer endpoint
 * resolves it when the user submits their answers.
 */

const pendingAnswers = new Map<
  string,
  (answers: Record<string, string>) => void
>();

export function setPendingAnswer(
  conversationId: string,
  resolve: (answers: Record<string, string>) => void
): void {
  pendingAnswers.set(conversationId, resolve);
}

export function resolvePendingAnswer(
  conversationId: string,
  answers: Record<string, string>
): boolean {
  const resolve = pendingAnswers.get(conversationId);
  if (!resolve) return false;
  pendingAnswers.delete(conversationId);
  resolve(answers);
  return true;
}

export function clearPendingAnswer(conversationId: string): void {
  pendingAnswers.delete(conversationId);
}
