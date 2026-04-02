import { Router, Request, Response } from 'express';
import { elevenLabsSynthesize } from '../services/tts-elevenlabs';

const router = Router();

router.post('/api/voice/tts', async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  console.log(`[Voice TTS] Request: ${text.substring(0, 60)}... (${text.length} chars)`);
  const start = Date.now();

  try {
    const audio = await elevenLabsSynthesize(text);
    if (!audio) {
      res.status(503).json({ error: 'ElevenLabs TTS not available' });
      return;
    }

    console.log(`[Voice TTS] Done in ${Date.now() - start}ms, ${audio.length} bytes`);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length.toString());
    res.send(audio);
  } catch (error) {
    console.error('[Voice TTS] Error:', error);
    res.status(500).json({ error: 'TTS failed' });
  }
});

router.get('/api/voice/deepgram-key', (_req: Request, res: Response) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key || key === 'your_deepgram_api_key') {
    res.status(503).json({ error: 'Deepgram not configured' });
    return;
  }
  res.json({ key });
});

export default router;
