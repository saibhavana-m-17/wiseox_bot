import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface VoiceEvent {
  type: 'transcript' | 'partial' | 'error' | 'listening' | 'stopped';
  text?: string;
}

@Injectable({ providedIn: 'root' })
export class VoiceService {
  events$ = new Subject<VoiceEvent>();

  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private deepgramKey = '';
  private active = false;

  async start(): Promise<void> {
    try {
      const res = await fetch(`${environment.apiBaseUrl}/api/voice/deepgram-key`);
      if (!res.ok) {
        this.events$.next({ type: 'error', text: 'deepgram_unavailable' });
        return;
      }
      const data = await res.json();
      this.deepgramKey = data.key;
    } catch {
      this.events$.next({ type: 'error', text: 'deepgram_unavailable' });
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.events$.next({ type: 'error', text: 'mic_denied' });
      return;
    }

    this.active = true;
    this.connectDeepgram();
  }

  stop(): void {
    this.active = false;
    this.ws?.close();
    this.ws = null;
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.events$.next({ type: 'stopped' });
  }

  private connectDeepgram(): void {
    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&endpointing=300`;
    this.ws = new WebSocket(url, ['token', this.deepgramKey]);

    this.ws.onopen = () => {
      console.log('[Deepgram] Connected');
      this.events$.next({ type: 'listening' });
      this.startRecording();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          if (data.is_final) {
            this.events$.next({ type: 'transcript', text: transcript });
          } else {
            this.events$.next({ type: 'partial', text: transcript });
          }
        }
      } catch {}
    };

    this.ws.onerror = () => this.events$.next({ type: 'error', text: 'connection_error' });
    this.ws.onclose = () => {
      if (this.active) setTimeout(() => this.connectDeepgram(), 500);
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
  }
}
