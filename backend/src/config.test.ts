import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws descriptive error when ANTHROPIC_API_KEY is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow('ANTHROPIC_API_KEY environment variable is required');
  });

  it('loads all env vars with provided values', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-123';
    process.env.CLAUDE_MODEL = 'claude-3-haiku';
    process.env.ANTHROPIC_MAX_TOKENS = '2048';
    process.env.MONGODB_URL = 'mongodb://custom:27017/testdb';
    process.env.PORT = '8080';
    process.env.KNOWLEDGE_BASE_PATH = '/custom/path';

    const config = loadConfig();

    expect(config.anthropicApiKey).toBe('test-key-123');
    expect(config.claudeModel).toBe('claude-3-haiku');
    expect(config.anthropicMaxTokens).toBe(2048);
    expect(config.mongodbUrl).toBe('mongodb://custom:27017/testdb');
    expect(config.port).toBe(8080);
    expect(config.knowledgeBasePath).toBe('/custom/path');
  });

  it('uses defaults when optional vars are not set', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const config = loadConfig();

    expect(config.claudeModel).toBe('claude-sonnet-4-20250514');
    expect(config.anthropicMaxTokens).toBe(4096);
    expect(config.mongodbUrl).toBe('mongodb://localhost:27017/wiseox');
    expect(config.port).toBe(3000);
    expect(config.knowledgeBasePath).toBe('../knowledge_base');
  });
});
