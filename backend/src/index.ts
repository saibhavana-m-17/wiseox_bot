import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config';
import { connectDatabase } from './database';
import { SystemPromptBuilder } from './services/system-prompt';
import { createChatRouter } from './routes/chat';
import conversationsRouter from './routes/conversations';
import { ensureIndexes } from './models/conversation';

async function main(): Promise<void> {
  const config = loadConfig();

  try {
    await connectDatabase(config.mongodbUrl);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }

  await ensureIndexes();

  const systemPrompt = await new SystemPromptBuilder(config.knowledgeBasePath).build();

  const anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(createChatRouter(anthropicClient, systemPrompt, config));
  app.use(conversationsRouter);

  app.listen(config.port, () => {
    console.log(`WiseOx Backend running on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
