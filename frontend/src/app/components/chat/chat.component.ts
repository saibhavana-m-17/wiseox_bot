import { Component, OnInit, AfterViewChecked, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { VoiceSonicService } from '../../services/voice-sonic.service';

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

  // Voice state
  callActive = false;
  isListening = false;
  isSpeaking = false;
  voiceTranscript = '';
  callStatus = 'Listening...';

  private subs: Subscription[] = [];
  private currentVoiceRole: 'user' | 'assistant' | null = null;
  private currentVoiceText = '';
  voiceMessages: ChatMessage[] = [];

  constructor(
    private chatService: ChatService,
    private voiceSonic: VoiceSonicService
  ) {}

  ngOnInit(): void {
    this.messages$ = this.chatService.messages$;
    this.isStreaming$ = this.chatService.isStreaming$;
    this.error$ = this.chatService.error$;
    this.subs.push(this.messages$.subscribe(() => this.shouldScroll = true));
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) { this.scrollToBottom(); this.shouldScroll = false; }
  }

  ngOnDestroy(): void {
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
        case 'connected':
          this.callStatus = 'Initializing...';
          break;
        case 'audioReady':
          this.callStatus = 'Listening...';
          this.isListening = true;
          break;
        case 'textOutput':
          if (event.data?.content) {
            this.voiceTranscript = event.data.content;
            this.currentVoiceText += event.data.content;
          }
          break;
        case 'contentStart':
          if (event.data?.type === 'AUDIO' && event.data?.role === 'ASSISTANT') {
            this.isSpeaking = true;
            this.callStatus = 'Speaking...';
          }
          if (event.data?.type === 'TEXT') {
            this.currentVoiceRole = event.data?.role === 'USER' ? 'user' : 'assistant';
            this.currentVoiceText = '';
          }
          break;
        case 'contentEnd':
          if (event.data?.type === 'TEXT' && this.currentVoiceRole && this.currentVoiceText.trim()) {
            this.voiceMessages.push({
              role: this.currentVoiceRole,
              content: this.currentVoiceText.trim()
            });
            this.currentVoiceRole = null;
            this.currentVoiceText = '';
          }
          if (event.data?.type === 'AUDIO') {
            this.isSpeaking = false;
            this.callStatus = 'Listening...';
            this.voiceTranscript = '';
          }
          break;
        case 'toolUse':
          this.callStatus = 'Searching...';
          break;
        case 'toolResult':
          this.callStatus = 'Speaking...';
          break;
        case 'error':
          console.error('[Voice] Error:', event.data);
          this.callStatus = 'Error — try again';
          break;
        case 'closed':
          this.callActive = false;
          this.isListening = false;
          this.isSpeaking = false;
          break;
      }
    });
    this.subs.push(sub);
    this.voiceSonic.start();
  }

  endCall(): void {
    this.callActive = false;
    this.isListening = false;
    this.isSpeaking = false;
    this.voiceTranscript = '';
    this.voiceSonic.stop();
  }

  stopSpeaking(): void {
    this.isSpeaking = false;
    this.callStatus = 'Listening...';
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (_) {}
  }
}
