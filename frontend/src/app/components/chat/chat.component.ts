import { Component, OnInit, AfterViewChecked, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { VoiceSonicService } from '../../services/voice-sonic.service';
import { SpeechToTextService } from '../../services/speech-to-text.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  messages$!: Observable<ChatMessage[]>;
  isStreaming$!: Observable<boolean>;
  error$!: Observable<string | null>;
  inputText = '';
  private shouldScroll = false;

  // Speech-to-text state
  isRecording = false;

  // Voice-to-voice state (kept for future use)
  callActive = false;
  isListening = false;
  isSpeaking = false;
  voiceTranscript = '';
  callStatus = 'Listening...';
  private currentVoiceRole: 'user' | 'assistant' | null = null;
  private currentVoiceText = '';
  voiceMessages: ChatMessage[] = [];

  private subs: Subscription[] = [];

  constructor(
    private chatService: ChatService,
    private voiceSonic: VoiceSonicService,
    private stt: SpeechToTextService
  ) {}

  ngOnInit(): void {
    this.messages$ = this.chatService.messages$;
    this.isStreaming$ = this.chatService.isStreaming$;
    this.error$ = this.chatService.error$;
    this.subs.push(this.messages$.subscribe(() => this.shouldScroll = true));

    // Listen for STT events
    this.subs.push(this.stt.events$.subscribe(event => {
      switch (event.type) {
        case 'listening':
          this.isRecording = true;
          break;
        case 'partial':
          if (event.text) this.inputText = event.text;
          break;
        case 'result':
          if (event.text) this.inputText = event.text;
          break;
        case 'error':
          this.isRecording = false;
          break;
        case 'stopped':
          this.isRecording = false;
          // Focus the input box after recording stops
          setTimeout(() => {
            const input = document.querySelector('.message-input') as HTMLInputElement;
            if (input) input.focus();
          }, 100);
          break;
      }
    }));
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) { this.scrollToBottom(); this.shouldScroll = false; }
  }

  ngOnDestroy(): void {
    this.stt.stop();
    this.endCall();
    this.subs.forEach(s => s.unsubscribe());
  }

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.inputText = '';
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.sendMessage(); }
  }

  // --- Speech-to-text mic button ---
  onMicClick(): void {
    // Remove focus from mic button so Enter doesn't retrigger it
    (document.activeElement as HTMLElement)?.blur();
    if (this.isRecording) {
      this.stt.stop();
    } else {
      this.inputText = '';
      this.stt.start();
    }
  }

  // --- Voice-to-voice (kept for future use) ---
  onPhoneClick(): void {
    this.callActive ? this.endCall() : this.startCall();
  }

  startCall(): void {
    this.callActive = true;
    this.callStatus = 'Connecting...';
    this.voiceTranscript = '';

    const sub = this.voiceSonic.events$.subscribe(event => {
      if (!this.callActive) return;
      switch (event.type) {
        case 'connected': this.callStatus = 'Initializing...'; break;
        case 'audioReady': this.callStatus = 'Listening...'; this.isListening = true; break;
        case 'textOutput':
          if (event.data?.content) { this.voiceTranscript = event.data.content; this.currentVoiceText += event.data.content; }
          break;
        case 'contentStart':
          if (event.data?.type === 'AUDIO' && event.data?.role === 'ASSISTANT') { this.isSpeaking = true; this.callStatus = 'Speaking...'; }
          if (event.data?.type === 'TEXT') { this.currentVoiceRole = event.data?.role === 'USER' ? 'user' : 'assistant'; this.currentVoiceText = ''; }
          break;
        case 'contentEnd':
          if (event.data?.type === 'TEXT' && this.currentVoiceRole && this.currentVoiceText.trim()) {
            this.voiceMessages.push({ role: this.currentVoiceRole, content: this.currentVoiceText.trim() });
            this.currentVoiceRole = null; this.currentVoiceText = '';
          }
          if (event.data?.type === 'AUDIO') { this.isSpeaking = false; this.callStatus = 'Listening...'; this.voiceTranscript = ''; }
          break;
        case 'toolUse': this.callStatus = 'Searching...'; break;
        case 'toolResult': this.callStatus = 'Speaking...'; break;
        case 'error':
          this.voiceSonic.stop();
          setTimeout(() => { if (this.callActive) { this.callActive = false; this.isListening = false; this.isSpeaking = false; this.voiceTranscript = ''; this.startCall(); } }, 1500);
          break;
        case 'closed': this.callActive = false; this.isListening = false; this.isSpeaking = false; break;
      }
    });
    this.subs.push(sub);
    this.voiceSonic.start();
  }

  endCall(): void {
    this.callActive = false; this.isListening = false; this.isSpeaking = false; this.voiceTranscript = '';
    this.voiceSonic.stop();
  }

  stopSpeaking(): void { this.isSpeaking = false; this.callStatus = 'Listening...'; }

  private scrollToBottom(): void {
    try { const el = this.messagesContainer?.nativeElement; if (el) el.scrollTop = el.scrollHeight; } catch (_) {}
  }
}
