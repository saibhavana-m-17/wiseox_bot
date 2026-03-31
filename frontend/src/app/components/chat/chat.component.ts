import { Component, OnInit, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatService, ChatMessage } from '../../services/chat.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  messages$!: Observable<ChatMessage[]>;
  isStreaming$!: Observable<boolean>;
  error$!: Observable<string | null>;
  inputText = '';
  showComingSoon = false;
  private shouldScroll = false;

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.messages$ = this.chatService.messages$;
    this.isStreaming$ = this.chatService.isStreaming$;
    this.error$ = this.chatService.error$;

    this.messages$.subscribe(() => {
      this.shouldScroll = true;
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text) return;
    this.chatService.sendMessage(text);
    this.inputText = '';
  }

  newChat(): void {
    this.chatService.newConversation();
  }

  onPhoneClick(): void {
    this.showComingSoon = true;
    setTimeout(() => this.showComingSoon = false, 2000);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch (_) {}
  }
}
