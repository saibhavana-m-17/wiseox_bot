import { Router, Request, Response } from 'express';
import {
  listConversations,
  getConversation,
  deleteConversation,
} from '../models/conversation';

const router = Router();

// GET /api/conversations — list all conversations (id, title, updatedAt), sorted by most recent
router.get('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const conversations = await listConversations();
    res.json(conversations);
  } catch (error: unknown) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// GET /api/conversations/:id — return full conversation with message history, or 404
router.get('/api/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conversation);
  } catch (error: unknown) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// DELETE /api/conversations/:id — remove conversation, or 404
router.delete('/api/conversations/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteConversation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.status(204).send();
  } catch (error: unknown) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

export default router;
