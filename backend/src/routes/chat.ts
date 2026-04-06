import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { streamChatResponse, SSEEvent } from '../services/chat';
import {
  createConversation,
  getConversation,
  appendMessages,
  Message,
} from '../models/conversation';
import { Config } from '../config';
import { SystemPromptBuilder } from '../services/system-prompt';

export function createChatRouter(
  anthropicClient: Anthropic,
  promptBuilder: SystemPromptBuilder,
  config: Config
): Router {
  const router = Router();

  router.post('/api/chat', async (req: Request, res: Response) => {
    const { message, conversationId } = req.body;
    const startTime = Date.now();

    // Validate message
    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    try {
      // Resolve or create conversation
      let conversation;
      if (conversationId) {
        conversation = await getConversation(conversationId);
        if (!conversation) {
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }
      } else {
        conversation = await createConversation(message.trim());
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Abort controller for client disconnect
      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      // Build messages array from conversation history + new user message
      const messages = [
        ...conversation.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: message.trim() },
      ];

      // Stream response from Claude — build focused prompt for this query
      const systemPrompt = promptBuilder.getPromptForQuery(message.trim());
      let fullResponse = '';

      try {
        const stream = streamChatResponse(anthropicClient, {
          systemPrompt,
          messages,
          model: config.claudeModel,
          maxTokens: config.anthropicMaxTokens,
          abortSignal: abortController.signal,
        });

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            break;
          }

          if (event.type === 'text_delta') {
            fullResponse += event.delta;
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        // If client disconnected, don't persist or send done
        if (abortController.signal.aborted) {
          return;
        }

        // Handle empty response from Claude
        if (!fullResponse.trim()) {
          console.warn(`[CHAT] Empty response from Claude for: "${message.trim().substring(0, 50)}" — retrying in 2s`);
          // Wait before retry to let network recover
          await new Promise(r => setTimeout(r, 2000));
          // Retry once with the same prompt
          const retryStream = streamChatResponse(anthropicClient, {
            systemPrompt,
            messages,
            model: config.claudeModel,
            maxTokens: config.anthropicMaxTokens,
            abortSignal: abortController.signal,
          });
          for await (const event of retryStream) {
            if (abortController.signal.aborted) break;
            if (event.type === 'text_delta') fullResponse += event.delta;
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          if (abortController.signal.aborted) return;
        }

        // Still empty after retry
        if (!fullResponse.trim()) {
          console.warn(`[CHAT] Still empty after retry for: "${message.trim().substring(0, 50)}"`);
          const fallback: SSEEvent = { type: 'text_delta', delta: 'Sorry, I was unable to generate a response. Please try asking your question again.' };
          res.write(`data: ${JSON.stringify(fallback)}\n\n`);
          fullResponse = 'Sorry, I was unable to generate a response. Please try asking your question again.';
        }

        // Persist user message + assistant response to MongoDB
        const now = new Date();
        const newMessages: Message[] = [
          { role: 'user', content: message.trim(), timestamp: now },
          { role: 'assistant', content: fullResponse, timestamp: now },
        ];
        await appendMessages(conversation.conversationId, newMessages);
        console.log(`[CHAT] Success - ${fullResponse.length} chars, ${Date.now() - startTime}ms`);

        // Send done event with conversationId
        const doneEvent: SSEEvent = {
          type: 'done',
          conversationId: conversation.conversationId,
        };
        res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
        res.end();
      } catch (error: unknown) {
        // If client already disconnected, nothing to send
        if (abortController.signal.aborted) {
          return;
        }

        // Check for Anthropic 429 rate limit
        if (
          error instanceof Anthropic.APIError &&
          error.status === 429
        ) {
          const rateLimitEvent: SSEEvent = {
            type: 'error',
            message: 'Rate limit reached. Please try again shortly.',
          };
          res.write(`data: ${JSON.stringify(rateLimitEvent)}\n\n`);
          res.end();
          return;
        }

        // Unexpected error — log full details, send generic message
        console.error('Chat streaming error:', error);
        const errorEvent: SSEEvent = {
          type: 'error',
          message: 'An unexpected error occurred',
        };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        res.end();
      }
    } catch (error: unknown) {
      // Pre-streaming errors (DB failures, etc.)
      console.error('Chat endpoint error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'An unexpected error occurred' });
      }
    }
  });

  return router;
}
