import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { MarkdownPipe } from './pipes/markdown.pipe';
import { ChatComponent } from './components/chat/chat.component';

@NgModule({
  declarations: [AppComponent, MarkdownPipe, ChatComponent],
  imports: [BrowserModule, HttpClientModule, FormsModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
