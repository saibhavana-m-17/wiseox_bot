import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { SseService, SSEEvent } from './sse.service';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private isStreamingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private conversationId: string | null = null;

  messages$ = this.messagesSubject.asObservable();
  isStreaming$ = this.isStreamingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient, private sseService: SseService) {}

  sendMessage(content: string): void {
    const messages = [...this.messagesSubject.value, { role: 'user' as const, content }];
    this.messagesSubject.next(messages);
    this.isStreamingSubject.next(true);
    this.errorSubject.next(null);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    this.messagesSubject.next([...messages, assistantMsg]);

    const url = `${environment.apiBaseUrl}/api/chat`;
    const body = { message: content, conversationId: this.conversationId };

    this.sseService.connect(url, body).subscribe({
      next: (event: SSEEvent) => {
        if (event.type === 'text_delta') {
          const current = this.messagesSubject.value;
          const lastMsg = { ...current[current.length - 1] };
          lastMsg.content += event.delta;
          this.messagesSubject.next([...current.slice(0, -1), lastMsg]);
        } else if (event.type === 'done') {
          this.conversationId = event.conversationId;
          this.isStreamingSubject.next(false);
        } else if (event.type === 'error') {
          this.errorSubject.next(event.message);
          this.isStreamingSubject.next(false);
        }
      },
      error: (err: Error) => {
        this.errorSubject.next(err.message || 'Unable to connect to server');
        this.isStreamingSubject.next(false);
        const current = this.messagesSubject.value;
        if (current.length > 0 && current[current.length - 1].content === '') {
          this.messagesSubject.next(current.slice(0, -1));
        }
      }
    });
  }

  loadConversation(id: string): Observable<void> {
    return new Observable(subscriber => {
      this.http.get<any>(`${environment.apiBaseUrl}/api/conversations/${id}`).subscribe({
        next: (conv) => {
          this.conversationId = conv.conversationId;
          this.messagesSubject.next(conv.messages || []);
          this.errorSubject.next(null);
          subscriber.next();
          subscriber.complete();
        },
        error: (err) => {
          this.errorSubject.next('Failed to load conversation');
          subscriber.error(err);
        }
      });
    });
  }

  getConversations(): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(`${environment.apiBaseUrl}/api/conversations`);
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/api/conversations/${id}`);
  }

  newConversation(): void {
    this.conversationId = null;
    this.messagesSubject.next([]);
    this.errorSubject.next(null);
    this.isStreamingSubject.next(false);
  }
}
