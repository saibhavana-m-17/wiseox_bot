/**
 * Nova Sonic Voice Service — Socket.IO handler
 */
import { Server, Socket } from 'socket.io';
import http from 'http';
import { NovaSonicClient, StreamSession } from '../lib/voiceClient';
import { DefaultSystemPrompt } from '../lib/voiceConsts';
import { SystemPromptBuilder } from './system-prompt';
import { Config } from '../config';
import { Buffer } from 'node:buffer';

let novaSonicClient: NovaSonicClient;
let promptBuilder: SystemPromptBuilder;
const socketSessions = new Map<string, StreamSession>();

function getClient(config: Config): NovaSonicClient {
  if (!novaSonicClient) {
    novaSonicClient = new NovaSonicClient({
      clientConfig: {
        region: config.awsRegion,
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
        },
      },
    });

    novaSonicClient.registerToolHandler('query_wiseox_kb', async (toolUseContent: any) => {
      try {
        let question = '';
        if (toolUseContent && typeof toolUseContent.content === 'string') {
          const parsed = JSON.parse(toolUseContent.content);
          question = parsed.question || '';
        }
        if (!question) return { error: 'No question provided' };

        console.log(`[KB Voice] Querying: ${question.substring(0, 80)}`);
        const kbPrompt = promptBuilder.getPromptForQuery(question);
        const kbContent = kbPrompt.substring(kbPrompt.indexOf('--- Source:'));
        return { answer: kbContent || 'No information found in the knowledge base.', source: 'WiseOx Knowledge Base' };
      } catch (error) {
        console.error('[KB Voice] Error:', error);
        return { error: 'Error querying knowledge base' };
      }
    });
  }
  return novaSonicClient;
}

export function initializeVoiceSocket(server: http.Server, config: Config, kb: SystemPromptBuilder): Server {
  promptBuilder = kb;
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  setInterval(() => {
    const client = getClient(config);
    client.getActiveSessions().forEach(id => {
      if (!novaSonicClient.isSessionActive(id)) {
        console.log(`[Voice] Cleaning up inactive session ${id}`);
        novaSonicClient.forceCloseSession(id);
        socketSessions.delete(id);
      }
    });
  }, 30000);

  io.on('connection', (socket: Socket) => {
    console.log('[Voice] Client connected:', socket.id);

    socket.on('initializeConnection', async (callback) => {
      try {
        const client = getClient(config);
        const session = client.createStreamSession(socket.id);
        setupEventHandlers(session, socket);
        socketSessions.set(socket.id, session);
        client.initiateBidirectionalStreaming(socket.id);
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('[Voice] Init error:', error);
        if (callback) callback({ success: false, error: String(error) });
      }
    });

    socket.on('promptStart', async () => {
      const session = socketSessions.get(socket.id);
      if (session) await session.setupSessionAndPromptStart();
    });

    socket.on('systemPrompt', async () => {
      const session = socketSessions.get(socket.id);
      if (session) await session.setupSystemPrompt(DefaultSystemPrompt);
    });

    socket.on('audioStart', async () => {
      const session = socketSessions.get(socket.id);
      if (!session) return;
      await session.setupStartAudio();
      await session.sendUserText('Hello');
      socket.emit('audioReady');
    });

    socket.on('audioInput', async (audioData: any) => {
      const session = socketSessions.get(socket.id);
      if (!session) return;
      try {
        const buf = typeof audioData === 'string' ? Buffer.from(audioData, 'base64') : Buffer.from(audioData);
        await session.streamAudio(buf);
      } catch (e) { /* ignore */ }
    });

    socket.on('stopAudio', async () => {
      const session = socketSessions.get(socket.id);
      if (!session) return;
      socketSessions.delete(socket.id);
      try {
        await Promise.race([
          (async () => { await session.endAudioContent(); await session.endPrompt(); await session.close(); })(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);
      } catch {
        getClient(config).forceCloseSession(socket.id);
      }
      socket.emit('sessionClosed');
    });

    socket.on('disconnect', async () => {
      console.log('[Voice] Client disconnected:', socket.id);
      const session = socketSessions.get(socket.id);
      if (session) {
        try {
          await Promise.race([
            (async () => { await session.endAudioContent(); await session.endPrompt(); await session.close(); })(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
          ]);
        } catch { getClient(config).forceCloseSession(socket.id); }
      }
      socketSessions.delete(socket.id);
    });
  });

  console.log('[Voice] Socket.IO voice server initialized');
  return io;
}

function setupEventHandlers(session: StreamSession, socket: Socket) {
  session.onEvent('contentStart', (data) => socket.emit('contentStart', data));
  session.onEvent('textOutput', (data) => socket.emit('textOutput', data));
  session.onEvent('audioOutput', (data) => socket.emit('audioOutput', data));
  session.onEvent('toolUse', (data) => socket.emit('toolUse', data));
  session.onEvent('toolResult', (data) => socket.emit('toolResult', data));
  session.onEvent('contentEnd', (data) => socket.emit('contentEnd', data));
  session.onEvent('error', (data) => socket.emit('error', data));
  session.onEvent('streamComplete', () => socket.emit('streamComplete'));
}
