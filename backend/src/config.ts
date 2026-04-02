export interface Config {
  anthropicApiKey: string;
  claudeModel: string;
  anthropicMaxTokens: number;
  mongodbUrl: string;
  port: number;
  knowledgeBasePath: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  deepgramApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
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
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  };
}
