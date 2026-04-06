import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <div class="branding">
      <h1 class="brand-title">AccuShield</h1>
      <p class="brand-subtitle">AccuShield Assist</p>
    </div>
    <div class="chat-wrapper" *ngIf="chatOpen">
      <app-chat></app-chat>
    </div>
    <button class="chat-fab" (click)="toggleChat()" [class.open]="chatOpen">
      <svg *ngIf="!chatOpen" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
      </svg>
      <svg *ngIf="chatOpen" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  `,
  styles: [`
    .branding {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      text-align: center; color: rgba(255, 255, 255, 0.9); user-select: none;
    }
    .brand-title { font-size: 3.5rem; font-weight: 700; margin: 0; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2); }
    .brand-subtitle { font-size: 1.1rem; margin: 8px 0 0; font-weight: 300; letter-spacing: 1px; opacity: 0.8; }
    .chat-wrapper { position: fixed; bottom: 90px; right: 24px; z-index: 1000; animation: slideUp 0.25s ease-out; }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .chat-fab {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%;
      border: none; background: #1a1a2e; color: #fff; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25); display: flex; align-items: center;
      justify-content: center; z-index: 1001; transition: transform 0.2s, background 0.2s;
    }
    .chat-fab:hover { transform: scale(1.08); }
    .chat-fab.open { background: #1a1a2e; }
  `]
})
export class AppComponent {
  chatOpen = true;

  toggleChat(): void {
    if (this.chatOpen) {
      window.speechSynthesis.cancel();
    }
    this.chatOpen = !this.chatOpen;
  }
}
