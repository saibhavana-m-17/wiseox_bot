/**
 * Nova Sonic Bidirectional Stream Client
 */
import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import {
  DefaultAudioInputConfiguration,
  DefaultAudioOutputConfiguration,
  DefaultTextConfiguration,
  DefaultToolSchema,
  WiseOxKBToolSchema,
  DefaultSystemPrompt,
} from './voiceConsts';
import type { InferenceConfig } from './voiceTypes';

export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private maxQueueSize = 50;
  private isProcessingAudio = false;
  private isActive = true;

  constructor(private sessionId: string, private client: NovaSonicClient) {}

  public onEvent(eventType: string, handler: (data: any) => void): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  public async setupSessionAndPromptStart(): Promise<void> {
    this.client.setupSessionStartEvent(this.sessionId);
    this.client.setupPromptStartEvent(this.sessionId);
  }

  public async setupSystemPrompt(content: string = DefaultSystemPrompt): Promise<void> {
    this.client.setupSystemPromptEvent(this.sessionId, DefaultTextConfiguration, content);
  }

  public async setupStartAudio(): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, DefaultAudioInputConfiguration);
  }

  public async streamAudio(audioData: Buffer): Promise<void> {
    if (this.audioBufferQueue.length >= this.maxQueueSize) this.audioBufferQueue.shift();
    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  private async processAudioQueue() {
    if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) return;
    this.isProcessingAudio = true;
    try {
      let count = 0;
      while (this.audioBufferQueue.length > 0 && count < 10 && this.isActive) {
        const chunk = this.audioBufferQueue.shift();
        if (chunk) { await this.client.streamAudioChunk(this.sessionId, chunk); count++; }
      }
    } finally {
      this.isProcessingAudio = false;
      if (this.audioBufferQueue.length > 0 && this.isActive) setTimeout(() => this.processAudioQueue(), 0);
    }
  }

  public async sendUserText(text: string): Promise<void> { this.client.sendUserTextEvent(this.sessionId, text); }
  public async endAudioContent(): Promise<void> { if (this.isActive) await this.client.sendContentEnd(this.sessionId); }
  public async endPrompt(): Promise<void> { if (this.isActive) await this.client.sendPromptEnd(this.sessionId); }
  public async close(): Promise<void> {
    if (!this.isActive) return;
    this.isActive = false;
    this.audioBufferQueue = [];
    await this.client.sendSessionEnd(this.sessionId);
  }
  public getSessionId(): string { return this.sessionId; }
}

interface SessionData {
  queue: any[];
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  toolUseContent: any;
  toolUseId: string;
  toolName: string;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
}

export class NovaSonicClient {
  private bedrockClient: BedrockRuntimeClient;
  private inferenceConfig: InferenceConfig;
  private activeSessions = new Map<string, SessionData>();
  private externalToolHandlers = new Map<string, (content: any) => Promise<object>>();

  constructor(config: { clientConfig: Partial<BedrockRuntimeClientConfig>; inferenceConfig?: InferenceConfig }) {
    const handler = new NodeHttp2Handler({ requestTimeout: 300000, sessionTimeout: 300000, disableConcurrentStreams: false, maxConcurrentStreams: 20 });
    this.bedrockClient = new BedrockRuntimeClient({ ...config.clientConfig, requestHandler: handler });
    this.inferenceConfig = config.inferenceConfig ?? { maxTokens: 1024, topP: 0.9, temperature: 0.7 };
  }

  public isSessionActive(id: string): boolean { const s = this.activeSessions.get(id); return !!s && s.isActive; }
  public getActiveSessions(): string[] { return Array.from(this.activeSessions.keys()); }

  public registerToolHandler(name: string, handler: (content: any) => Promise<object>): void {
    this.externalToolHandlers.set(name.toLowerCase(), handler);
  }

  public createStreamSession(sessionId: string = randomUUID()): StreamSession {
    if (this.activeSessions.has(sessionId)) throw new Error(`Session ${sessionId} already exists`);
    const session: SessionData = {
      queue: [], queueSignal: new Subject(), closeSignal: new Subject(),
      toolUseContent: null, toolUseId: '', toolName: '',
      responseHandlers: new Map(), promptName: randomUUID(),
      inferenceConfig: this.inferenceConfig, isActive: true,
      isPromptStartSent: false, isAudioContentStartSent: false, audioContentId: randomUUID(),
    };
    this.activeSessions.set(sessionId, session);
    return new StreamSession(sessionId, this);
  }

  private async processToolUse(toolName: string, content: object): Promise<object> {
    const handler = this.externalToolHandlers.get(toolName.toLowerCase());
    if (handler) return handler(content);
    if (toolName.toLowerCase() === 'getdateandtimetool') {
      const d = new Date();
      return { date: d.toISOString().split('T')[0], formattedTime: d.toLocaleTimeString('en-US', { hour12: true }) };
    }
    throw new Error(`Tool ${toolName} not supported`);
  }

  private addEvent(sessionId: string, event: any): void {
    const s = this.activeSessions.get(sessionId);
    if (!s || !s.isActive) return;
    s.queue.push(event);
    s.queueSignal.next();
  }

  private dispatch(sessionId: string, type: string, data: any): void {
    const s = this.activeSessions.get(sessionId);
    if (!s) return;
    const h = s.responseHandlers.get(type);
    if (h) try { h(data); } catch (e) { console.error(`Error in ${type} handler:`, e); }
  }

  public async initiateBidirectionalStreaming(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    try {
      const asyncIterable = this.createAsyncIterable(sessionId);
      const response = await this.bedrockClient.send(
        new InvokeModelWithBidirectionalStreamCommand({ modelId: 'amazon.nova-sonic-v1:0', body: asyncIterable })
      );
      await this.processResponseStream(sessionId, response);
    } catch (error) {
      console.error(`[Voice] Error in session ${sessionId}:`, error);
      this.dispatch(sessionId, 'error', { source: 'stream', error });
      if (session.isActive) this.forceCloseSession(sessionId);
    }
  }

  private createAsyncIterable(sessionId: string): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    const session = this.activeSessions.get(sessionId)!;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
          if (!session.isActive) return { value: undefined, done: true };
          if (session.queue.length === 0) {
            try {
              await Promise.race([
                firstValueFrom(session.queueSignal.pipe(take(1))),
                firstValueFrom(session.closeSignal.pipe(take(1))).then(() => { throw new Error('closed'); }),
              ]);
            } catch { return { value: undefined, done: true }; }
          }
          if (session.queue.length === 0 || !session.isActive) return { value: undefined, done: true };
          const event = session.queue.shift();
          return { value: { chunk: { bytes: new TextEncoder().encode(JSON.stringify(event)) } }, done: false };
        },
        return: async () => { session.isActive = false; return { value: undefined, done: true as const }; },
        throw: async (e: any) => { session.isActive = false; throw e; },
      }),
    };
  }

  private async processResponseStream(sessionId: string, response: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    try {
      for await (const event of response.body) {
        if (!session.isActive) break;
        if (event.chunk?.bytes) {
          const json = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
          if (json.event?.contentStart) this.dispatch(sessionId, 'contentStart', json.event.contentStart);
          else if (json.event?.textOutput) this.dispatch(sessionId, 'textOutput', json.event.textOutput);
          else if (json.event?.audioOutput) this.dispatch(sessionId, 'audioOutput', json.event.audioOutput);
          else if (json.event?.toolUse) {
            this.dispatch(sessionId, 'toolUse', json.event.toolUse);
            session.toolUseContent = json.event.toolUse;
            session.toolUseId = json.event.toolUse.toolUseId;
            session.toolName = json.event.toolUse.toolName;
          } else if (json.event?.contentEnd?.type === 'TOOL') {
            const result = await this.processToolUse(session.toolName, session.toolUseContent);
            this.sendToolResult(sessionId, session.toolUseId, result);
            this.dispatch(sessionId, 'toolResult', { toolUseId: session.toolUseId, result });
          } else if (json.event?.contentEnd) this.dispatch(sessionId, 'contentEnd', json.event.contentEnd);
        }
      }
      this.dispatch(sessionId, 'streamComplete', {});
    } catch (error: any) {
      if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        console.log(`[Voice] Stream closed for ${sessionId} (client disconnected)`);
      } else {
        console.error(`[Voice] Response stream error for ${sessionId}:`, error);
        this.dispatch(sessionId, 'error', { source: 'responseStream', error });
      }
    }
  }

  public setupSessionStartEvent(id: string): void {
    const s = this.activeSessions.get(id); if (!s) return;
    this.addEvent(id, { event: { sessionStart: { inferenceConfiguration: s.inferenceConfig } } });
  }

  public setupPromptStartEvent(id: string): void {
    const s = this.activeSessions.get(id); if (!s) return;
    this.addEvent(id, { event: { promptStart: {
      promptName: s.promptName,
      textOutputConfiguration: { mediaType: 'text/plain' },
      audioOutputConfiguration: DefaultAudioOutputConfiguration,
      toolUseOutputConfiguration: { mediaType: 'application/json' },
      toolConfiguration: { tools: [
        { toolSpec: { name: 'getDateAndTimeTool', description: 'Get current date and time.', inputSchema: { json: DefaultToolSchema } } },
        { toolSpec: { name: 'query_wiseox_kb', description: 'Search the WiseOx knowledge base for information about AccuShield features, setup, and procedures.', inputSchema: { json: WiseOxKBToolSchema } } },
      ] },
    } } });
    s.isPromptStartSent = true;
  }

  public setupSystemPromptEvent(id: string, textConfig: any, content: string): void {
    const s = this.activeSessions.get(id); if (!s) return;
    const cid = randomUUID();
    this.addEvent(id, { event: { contentStart: { promptName: s.promptName, contentName: cid, type: 'TEXT', interactive: false, role: 'SYSTEM', textInputConfiguration: textConfig } } });
    this.addEvent(id, { event: { textInput: { promptName: s.promptName, contentName: cid, content } } });
    this.addEvent(id, { event: { contentEnd: { promptName: s.promptName, contentName: cid } } });
  }

  public setupStartAudioEvent(id: string, audioConfig: any): void {
    const s = this.activeSessions.get(id); if (!s) return;
    this.addEvent(id, { event: { contentStart: { promptName: s.promptName, contentName: s.audioContentId, type: 'AUDIO', interactive: true, role: 'USER', audioInputConfiguration: audioConfig } } });
    s.isAudioContentStartSent = true;
  }

  public async streamAudioChunk(id: string, audioData: Buffer): Promise<void> {
    const s = this.activeSessions.get(id);
    if (!s || !s.isActive) return;
    this.addEvent(id, { event: { audioInput: { promptName: s.promptName, contentName: s.audioContentId, content: audioData.toString('base64') } } });
  }

  public sendUserTextEvent(id: string, text: string): void {
    const s = this.activeSessions.get(id); if (!s) return;
    const cid = randomUUID();
    this.addEvent(id, { event: { contentStart: { promptName: s.promptName, contentName: cid, type: 'TEXT', interactive: false, role: 'USER', textInputConfiguration: { mediaType: 'text/plain' } } } });
    this.addEvent(id, { event: { textInput: { promptName: s.promptName, contentName: cid, content: text } } });
    this.addEvent(id, { event: { contentEnd: { promptName: s.promptName, contentName: cid } } });
  }

  private sendToolResult(id: string, toolUseId: string, result: any): void {
    const s = this.activeSessions.get(id); if (!s || !s.isActive) return;
    const cid = randomUUID();
    this.addEvent(id, { event: { contentStart: { promptName: s.promptName, contentName: cid, interactive: false, type: 'TOOL', role: 'TOOL', toolResultInputConfiguration: { toolUseId, type: 'TEXT', textInputConfiguration: { mediaType: 'text/plain' } } } } });
    this.addEvent(id, { event: { toolResult: { promptName: s.promptName, contentName: cid, content: typeof result === 'string' ? result : JSON.stringify(result) } } });
    this.addEvent(id, { event: { contentEnd: { promptName: s.promptName, contentName: cid } } });
  }

  public async sendContentEnd(id: string): Promise<void> {
    const s = this.activeSessions.get(id); if (!s?.isAudioContentStartSent) return;
    this.addEvent(id, { event: { contentEnd: { promptName: s.promptName, contentName: s.audioContentId } } });
    await new Promise(r => setTimeout(r, 500));
  }

  public async sendPromptEnd(id: string): Promise<void> {
    const s = this.activeSessions.get(id); if (!s?.isPromptStartSent) return;
    this.addEvent(id, { event: { promptEnd: { promptName: s.promptName } } });
    await new Promise(r => setTimeout(r, 300));
  }

  public async sendSessionEnd(id: string): Promise<void> {
    const s = this.activeSessions.get(id); if (!s) return;
    this.addEvent(id, { event: { sessionEnd: {} } });
    await new Promise(r => setTimeout(r, 300));
    s.isActive = false;
    s.closeSignal.next();
    s.closeSignal.complete();
    this.activeSessions.delete(id);
  }

  public registerEventHandler(id: string, type: string, handler: (data: any) => void): void {
    const s = this.activeSessions.get(id); if (!s) return;
    s.responseHandlers.set(type, handler);
  }

  public forceCloseSession(id: string): void {
    const s = this.activeSessions.get(id); if (!s) return;
    s.isActive = false;
    s.closeSignal.next();
    s.closeSignal.complete();
    this.activeSessions.delete(id);
    console.log(`[Voice] Session ${id} force closed`);
  }
}