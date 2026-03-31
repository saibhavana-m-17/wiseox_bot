import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface SSETextDelta { type: 'text_delta'; delta: string; }
export interface SSEDone { type: 'done'; conversationId: string; }
export interface SSEError { type: 'error'; message: string; }
export type SSEEvent = SSETextDelta | SSEDone | SSEError;

@Injectable({ providedIn: 'root' })
export class SseService {
  connect(url: string, body: object): Observable<SSEEvent> {
    return new Observable<SSEEvent>(subscriber => {
      const abortController = new AbortController();

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })
      .then(async response => {
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Request failed' }));
          subscriber.error(new Error(errorBody.error || `HTTP ${response.status}`));
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as SSEEvent;
                subscriber.next(event);
                if (event.type === 'done' || event.type === 'error') {
                  subscriber.complete();
                  return;
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
        subscriber.complete();
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          subscriber.error(error);
        }
      });

      return () => abortController.abort();
    });
  }
}
