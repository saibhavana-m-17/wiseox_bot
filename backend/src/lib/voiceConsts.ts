import type { AudioType, AudioMediaType, TextMediaType } from './voiceTypes';

export const DefaultAudioInputConfiguration = {
  audioType: 'SPEECH' as AudioType,
  encoding: 'base64',
  mediaType: 'audio/lpcm' as AudioMediaType,
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
};

export const DefaultAudioOutputConfiguration = {
  ...DefaultAudioInputConfiguration,
  sampleRateHertz: 24000,
  voiceId: 'tiffany',
};

export const DefaultTextConfiguration = { mediaType: 'text/plain' as TextMediaType };

export const DefaultToolSchema = JSON.stringify({
  type: 'object',
  properties: {},
  required: [],
});

export const WiseOxKBToolSchema = JSON.stringify({
  type: 'object',
  properties: {
    question: { type: 'string', description: 'The question to search for in the WiseOx knowledge base.' },
  },
  required: ['question'],
});

export const DefaultSystemPrompt = `You are WiseOx, a helpful voice assistant for Accushield, a visitor management system for senior living communities.

IMPORTANT: When the conversation starts, greet the user by saying "Hi, how can I help you today?"

When users ask about Accushield features, procedures, or setup:
- Use the query_wiseox_kb tool to search for accurate information
- Speak naturally and conversationally
- Convert lists into flowing speech
- Keep responses concise but informative

VOICE RESPONSE STYLE:
- Speak naturally, not like reading a document
- Instead of numbered lists, say "First, do this. Then, do that."
- Use conversational transitions like "Next", "After that", "Finally"
- Avoid reading formatting markers

Keep your tone friendly, helpful, and natural for voice conversation.`;
