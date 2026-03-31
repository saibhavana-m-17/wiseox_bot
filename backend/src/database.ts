import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB using the provided URL.
 * Extracts the database name from the URL path (defaults to 'wiseox').
 */
export async function connectDatabase(url: string): Promise<void> {
  try {
    const mongoClient = new MongoClient(url);
    await mongoClient.connect();

    // Extract db name from URL path, default to 'wiseox'
    const dbName = new URL(url).pathname.replace(/^\//, '') || 'wiseox';

    client = mongoClient;
    db = mongoClient.db(dbName);

    console.log(`Connected to MongoDB (database: ${dbName})`);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Returns the active Db instance. Throws if not connected.
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return db;
}

/**
 * Returns the active MongoClient instance. Throws if not connected.
 */
export function getClient(): MongoClient {
  if (!client) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return client;
}

/**
 * Gracefully close the MongoDB connection.
 */
export async function disconnectDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('Disconnected from MongoDB');
  }
}
