import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface STTEvent {
  type: 'result' | 'partial' | 'error' | 'listening' | 'stopped';
  text?: string;
}

@Injectable({ providedIn: 'root' })
export class SpeechToTextService {
  events$ = new Subject<STTEvent>();
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private active = false;
  private starting = false;
  private fullTranscript = '';
  private silenceTimer: any = null;

  constructor(private zone: NgZone) {}

  async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.cleanup();

    let key = '';
    try {
      const res = await fetch(`${environment.apiBaseUrl}/api/voice/deepgram-key?t=${Date.now()}`);
      if (!res.ok) { this.emit('error', 'Deepgram not configured'); this.starting = false; return; }
      key = (await res.json()).key;
    } catch { this.emit('error', 'Could not connect to server'); this.starting = false; return; }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch { this.emit('error', 'Microphone access denied'); this.starting = false; return; }

    this.active = true;
    this.starting = false;
    this.fullTranscript = '';
    this.connectDeepgram(key);
  }

  stop(): void {
    this.active = false;
    this.starting = false;
    this.cleanup();
    this.emit('stopped');
  }

  isActive(): boolean { return this.active; }

  private emit(type: STTEvent['type'], text?: string): void {
    this.zone.run(() => this.events$.next({ type, text }));
  }

  private cleanup(): void {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }
    this.ws = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
    }
    this.mediaStream = null;
  }

  private connectDeepgram(key: string): void {
    const url = 'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&endpointing=5000';
    this.ws = new WebSocket(url, ['token', key]);

    this.ws.onopen = () => {
      console.log('[STT] Deepgram connected');
      this.emit('listening');
      this.startRecording();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        // Reset silence timer on any speech
        this.resetSilenceTimer();

        this.zone.run(() => {
          if (data.is_final) {
            this.fullTranscript += (this.fullTranscript ? ' ' : '') + transcript;
            this.events$.next({ type: 'result', text: this.fullTranscript.trim() });
          } else {
            const interim = this.fullTranscript + (this.fullTranscript ? ' ' : '') + transcript;
            this.events$.next({ type: 'partial', text: interim.trim() });
          }
        });
      } catch {}
    };

    this.ws.onerror = () => {
      console.error('[STT] WebSocket error');
      this.active = false;
      this.emit('error', 'Connection error');
    };

    this.ws.onclose = (event) => {
      console.log(`[STT] WebSocket closed: code=${event.code}`);
      if (this.active) {
        this.active = false;
        this.cleanup();
        this.emit('stopped');
      }
    };
  }

  private startRecording(): void {
    if (!this.mediaStream || !this.ws) return;
    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm;codecs=opus' });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(event.data);
      }
    };
    this.mediaRecorder.start(100);
    console.log('[STT] Recording started');
    this.resetSilenceTimer();
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      if (this.active) {
        console.log('[STT] Auto-stopping after silence');
        this.stop();
      }
    }, 1500);
  }
}
