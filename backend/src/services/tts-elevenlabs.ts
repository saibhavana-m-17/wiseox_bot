import { Config } from '../config';

let apiKey = '';
let voiceId = '';

export function initElevenLabsTTS(config: Config): void {
  if (!config.elevenlabsApiKey || config.elevenlabsApiKey === 'your_elevenlabs_api_key') {
    console.warn('[ElevenLabs] API key not set — ElevenLabs TTS disabled');
    return;
  }
  apiKey = config.elevenlabsApiKey;
  voiceId = config.elevenlabsVoiceId;
  console.log(`[ElevenLabs] Initialized with voice: ${voiceId}`);
}

export async function elevenLabsSynthesize(text: string): Promise<Buffer | null> {
  if (!apiKey) return null;

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
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      console.error(`[ElevenLabs] Error: ${response.status} ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('[ElevenLabs] Synthesis error:', error);
    return null;
  }
}
