import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  conversationId: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const COLLECTION = 'conversations';

/**
 * Create indexes on the conversations collection.
 * - Unique index on conversationId
 * - Descending index on updatedAt for sorted listing
 */
export async function ensureIndexes(): Promise<void> {
  const col = getDb().collection(COLLECTION);
  await col.createIndex({ conversationId: 1 }, { unique: true });
  await col.createIndex({ updatedAt: -1 });
}

/**
 * Create a new conversation. Title is auto-generated from the first 50 chars
 * of the first user message.
 */
export async function createConversation(firstMessage: string): Promise<Conversation> {
  const now = new Date();
  const conversation: Conversation = {
    conversationId: uuidv4(),
    title: firstMessage.slice(0, 50),
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  await getDb().collection(COLLECTION).insertOne({ ...conversation });
  return conversation;
}

/**
 * Retrieve a conversation by its conversationId.
 */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const doc = await getDb()
    .collection(COLLECTION)
    .findOne({ conversationId }, { projection: { _id: 0 } });
  return doc as Conversation | null;
}

/**
 * List all conversations sorted by updatedAt descending.
 * Returns only conversationId, title, and updatedAt.
 */
export async function listConversations(): Promise<Array<{ conversationId: string; title: string; updatedAt: Date }>> {
  return getDb()
    .collection(COLLECTION)
    .find({}, { projection: { _id: 0, conversationId: 1, title: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .toArray() as unknown as Promise<Array<{ conversationId: string; title: string; updatedAt: Date }>>;
}

/**
 * Append messages to an existing conversation and update the updatedAt timestamp.
 */
export async function appendMessages(conversationId: string, messages: Message[]): Promise<void> {
  await getDb()
    .collection(COLLECTION)
    .updateOne(
      { conversationId },
      {
        $push: { messages: { $each: messages } } as any,
        $set: { updatedAt: new Date() },
      }
    );
}

/**
 * Delete a conversation by conversationId. Returns true if a document was deleted.
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  const result = await getDb()
    .collection(COLLECTION)
    .deleteOne({ conversationId });
  return result.deletedCount === 1;
}
