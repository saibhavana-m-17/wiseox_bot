import { Router, Request, Response } from 'express';
import { synthesizeSpeech } from '../services/tts';

const router = Router();

router.post('/api/tts', async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  console.log(`[TTS] Request: ${text.substring(0, 60)}... (${text.length} chars)`);

  try {
    const audio = await synthesizeSpeech(text);
    if (!audio) {
      res.status(503).json({ error: 'TTS not available' });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length.toString());
    res.send(audio);
  } catch (error) {
    console.error('[TTS] Endpoint error:', error);
    res.status(500).json({ error: 'TTS failed' });
  }
});

export default router;
