import { PollyClient, SynthesizeSpeechCommand, Engine, OutputFormat, VoiceId } from '@aws-sdk/client-polly';
import { Config } from '../config';

let pollyClient: PollyClient | null = null;

export function initTTS(config: Config): void {
  if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
    console.warn('[TTS] AWS credentials not set — TTS disabled');
    return;
  }
  pollyClient = new PollyClient({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    },
  });
  console.log(`[TTS] Initialized with region: ${config.awsRegion}`);
}

export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  if (!pollyClient) return null;

  const clean = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/#{1,3}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim();

  if (!clean) return null;

  try {
    const command = new SynthesizeSpeechCommand({
      Text: clean,
      OutputFormat: OutputFormat.MP3,
      VoiceId: VoiceId.Ruth,
      Engine: Engine.GENERATIVE,
    });

    const response = await pollyClient.send(command);

    if (response.AudioStream) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.AudioStream as any) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    return null;
  } catch (error) {
    console.error('[TTS] Synthesis error:', error);
    return null;
  }
}
