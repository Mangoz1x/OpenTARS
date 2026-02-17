import type { StatusInfo, StopReason, ErrorType } from "@/app/(chat)/components/types";

export function buildStopReasonStatus(stopReason: StopReason): StatusInfo | null {
  switch (stopReason) {
    case "max_tokens":
      return {
        level: "warning",
        title: "Response truncated",
        description:
          "The response was cut short because it reached the maximum output token limit. Try asking TARS to continue or to be more concise.",
        stopReason,
      };
    case "refusal":
      return {
        level: "error",
        title: "Request declined",
        description:
          "TARS was unable to fulfill this request. Try rephrasing your message or asking something different.",
        stopReason,
      };
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
    case null:
    default:
      return null;
  }
}

export function buildErrorStatus(
  message: string,
  errorType?: string,
  stopReason?: StopReason
): StatusInfo {
  const errorTypeKey = (errorType ?? "unknown") as ErrorType;

  const errorMap: Record<string, { title: string; description: string }> = {
    error_max_turns: {
      title: "Turn limit reached",
      description:
        "TARS hit the maximum number of conversation turns for this query. The response may be incomplete.",
    },
    error_max_budget_usd: {
      title: "Budget limit exceeded",
      description:
        "This query exceeded the configured spending limit and was stopped.",
    },
    error_during_execution: {
      title: "Something went wrong",
      description: message,
    },
    error_max_structured_output_retries: {
      title: "Output formatting failed",
      description:
        "TARS couldn't produce a valid structured response after multiple attempts.",
    },
    api_key_missing: {
      title: "API key not configured",
      description: message,
    },
    stream_interrupted: {
      title: "Connection lost",
      description:
        "The response stream was interrupted. This can happen due to network issues. Try sending your message again.",
    },
    unknown: {
      title: "Unexpected error",
      description: message,
    },
  };

  const info = errorMap[errorTypeKey] ?? errorMap.unknown;

  return {
    level: errorTypeKey === "api_key_missing" ? "warning" : "error",
    title: info.title,
    description: info.description,
    errorType: errorTypeKey,
    stopReason: stopReason ?? null,
  };
}
