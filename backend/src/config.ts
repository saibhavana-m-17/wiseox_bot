export interface Config {
  anthropicApiKey: string;
  claudeModel: string;
  anthropicMaxTokens: number;
  mongodbUrl: string;
  port: number;
  knowledgeBasePath: string;
}

export function loadConfig(): Config {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required but not set. ' +
      'Please set it in your .env file or environment.'
    );
  }

  return {
    anthropicApiKey,
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    anthropicMaxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096', 10),
    mongodbUrl: process.env.MONGODB_URL || 'mongodb://localhost:27017/wiseox',
    port: parseInt(process.env.PORT || '3000', 10),
    knowledgeBasePath: process.env.KNOWLEDGE_BASE_PATH || '../knowledge_base',
  };
}
