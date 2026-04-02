/**
 * Nova Sonic Voice Service — Socket.IO client
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

export interface VoiceSonicEvent {
  type: 'connected' | 'audioReady' | 'audioOutput' | 'textOutput' | 'contentStart' | 'contentEnd' | 'error' | 'closed' | 'toolUse' | 'toolResult';
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class VoiceSonicService {
  events$ = new Subject<VoiceSonicEvent>();

  private socket: Socket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private active = false;

  private playbackContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private prevSample = 0;

  async start(): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch {
      this.events$.next({ type: 'error', data: 'Mic access denied' });
      return false;
    }

    this.active = true;
    this.socket = io(environment.apiBaseUrl, { transports: ['websocket'] });
    this.setupSocketEvents();

    this.socket.emit('initializeConnection', (response: any) => {
      if (response?.success) {
        console.log('[VoiceSonic] Connection initialized');
        this.socket!.emit('promptStart');
        this.socket!.emit('systemPrompt');
        setTimeout(() => this.socket!.emit('audioStart'), 500);
      } else {
        console.error('[VoiceSonic] Init failed:', response?.error);
        this.events$.next({ type: 'error', data: response?.error || 'Failed to initialize' });
      }
    });

    return true;
  }

  stop(): void {
    this.active = false;
    if (this.socket) {
      this.socket.emit('stopAudio');
      setTimeout(() => { this.socket?.disconnect(); this.socket = null; }, 1000);
    }
    this.stopMic();
    this.stopPlayback();
    this.events$.next({ type: 'closed' });
  }

  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[VoiceSonic] Socket connected');
      this.events$.next({ type: 'connected' });
    });

    this.socket.on('audioReady', () => {
      console.log('[VoiceSonic] Audio ready, starting mic');
      this.startMicStreaming();
      this.events$.next({ type: 'audioReady' });
    });

    this.socket.on('audioOutput', (data: any) => {
      if (data?.content) this.playAudioChunk(data.content);
      this.events$.next({ type: 'audioOutput', data });
    });

    this.socket.on('textOutput', (data: any) => this.events$.next({ type: 'textOutput', data }));
    this.socket.on('contentStart', (data: any) => this.events$.next({ type: 'contentStart', data }));
    this.socket.on('contentEnd', (data: any) => this.events$.next({ type: 'contentEnd', data }));
    this.socket.on('toolUse', (data: any) => {
      console.log('[VoiceSonic] Tool use:', data?.toolName);
      this.events$.next({ type: 'toolUse', data });
    });
    this.socket.on('toolResult', (data: any) => this.events$.next({ type: 'toolResult', data }));
    this.socket.on('error', (data: any) => {
      console.error('[VoiceSonic] Error:', data);
      this.events$.next({ type: 'error', data });
    });
    this.socket.on('sessionClosed', () => this.events$.next({ type: 'closed' }));
    this.socket.on('disconnect', () => {
      console.log('[VoiceSonic] Socket disconnected');
      if (this.active) this.events$.next({ type: 'error', data: 'Disconnected' });
    });
  }

  private startMicStreaming(): void {
    if (!this.mediaStream || !this.socket) return;

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.active || !this.socket) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.socket.emit('audioInput', this.bufferToBase64(pcm16.buffer));
    };

    this.sourceNode.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  private async playAudioChunk(base64Audio: string): Promise<void> {
    if (!this.active) return;

    const raw = atob(base64Audio);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);

    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const CROSSFADE_SAMPLES = 4;
    if (this.prevSample !== 0) {
      const blendLen = Math.min(CROSSFADE_SAMPLES, float32.length);
      for (let i = 0; i < blendLen; i++) {
        const t = (i + 1) / (blendLen + 1);
        float32[i] = this.prevSample * (1 - t) + float32[i] * t;
      }
    }
    this.prevSample = float32[float32.length - 1];

    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = 0;
    }
    if (this.playbackContext.state === 'suspended') {
      await this.playbackContext.resume();
    }

    const buffer = this.playbackContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const now = this.playbackContext.currentTime;
    const JITTER_TOLERANCE = 0.15;
    if (this.nextPlayTime < now - JITTER_TOLERANCE) {
      this.nextPlayTime = now + 0.05;
    }

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackContext.destination);
    source.start(this.nextPlayTime);
    this.nextPlayTime += buffer.duration;
  }

  private stopMic(): void {
    this.scriptProcessor?.disconnect();
    this.sourceNode?.disconnect();
    this.audioContext?.close();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.scriptProcessor = null;
    this.sourceNode = null;
    this.audioContext = null;
    this.mediaStream = null;
  }

  private stopPlayback(): void {
    this.nextPlayTime = 0;
    this.prevSample = 0;
    this.playbackContext?.close();
    this.playbackContext = null;
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
