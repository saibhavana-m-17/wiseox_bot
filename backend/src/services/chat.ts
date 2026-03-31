import Anthropic from '@anthropic-ai/sdk';

export interface SSETextDelta {
  type: 'text_delta';
  delta: string;
}

export interface SSEDone {
  type: 'done';
  conversationId: string;
}

export interface SSEError {
  type: 'error';
  message: string;
}

export type SSEEvent = SSETextDelta | SSEDone | SSEError;

export interface ChatStreamOptions {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model: string;
  maxTokens: number;
  abortSignal?: AbortSignal;
}

export async function* streamChatResponse(
  client: Anthropic,
  options: ChatStreamOptions
): AsyncGenerator<SSEEvent> {
  const { systemPrompt, messages, model, maxTokens, abortSignal } = options;

  let stream: ReturnType<typeof client.messages.stream> | undefined;

  try {
    stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Handle abort signal — abort the stream when the client disconnects
    const onAbort = () => {
      stream?.abort();
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        stream.abort();
        return;
      }
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text_delta', delta: event.delta.text } as SSETextDelta;
        }
      }
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    }
  } catch (error: unknown) {
    // Don't yield an error event for abort — the client is already gone
    if (abortSignal?.aborted) {
      return;
    }

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    yield { type: 'error', message } as SSEError;
  }
}
