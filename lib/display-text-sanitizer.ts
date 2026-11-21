/** Remove leaked provider/tool protocol envelopes before any assistant text reaches UI. */
export function sanitizeAssistantDisplayText(input: string): string {
    if (!input) return "";
    return input
        // MiniMax/OpenAI-style raw tool-call channel accidentally included in plain text.
        .replace(/\s*\]?<\|(?:minimax|tool_call|tool_result)\|>\s*(?:\[)?<tool_call>[\s\S]*$/gi, "")
        .replace(/<tool_call\b[^>]*>[\s\S]*?(?:<\/tool_call>|$)/gi, "")
        .replace(/<tool_result\b[^>]*>[\s\S]*?(?:<\/tool_result>|$)/gi, "")
        .replace(/\[tool_call\b[^\]]*\][\s\S]*?(?:\[\/tool_call\]|$)/gi, "")
        .replace(/\[tool_result\b[^\]]*\][\s\S]*?(?:\[\/tool_result\]|$)/gi, "")
        .replace(/<\|(?:minimax|tool_call|tool_result)\|>/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

