import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config';
import { connectDatabase } from './database';
import { SystemPromptBuilder } from './services/system-prompt';
import { createChatRouter } from './routes/chat';
import conversationsRouter from './routes/conversations';
import ttsRouter from './routes/tts';
import voiceRouter from './routes/voice';
import { ensureIndexes } from './models/conversation';
import { initTTS } from './services/tts';
import { initElevenLabsTTS } from './services/tts-elevenlabs';
import { initializeVoiceSocket } from './services/voice-sonic';

async function main(): Promise<void> {
  const config = loadConfig();

  try {
    await connectDatabase(config.mongodbUrl);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }

  await ensureIndexes();

  const promptBuilder = new SystemPromptBuilder(config.knowledgeBasePath);
  await promptBuilder.build();

  const anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 60000 });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(createChatRouter(anthropicClient, promptBuilder, config));
  app.use(conversationsRouter);
  app.use(ttsRouter);
  app.use(voiceRouter);

  initTTS(config);
  initElevenLabsTTS(config);

  const server = http.createServer(app);
  initializeVoiceSocket(server, config, promptBuilder);

  server.listen(config.port, () => {
    console.log(`WiseOx Backend running on port ${config.port}`);
    console.log(`Voice Socket.IO available on ws://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
