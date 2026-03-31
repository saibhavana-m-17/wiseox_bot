import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    try {
      let html = value;

      // Code blocks (``` ... ```)
      html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

      // Inline code (`...`)
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

      // Links [text](url)
      html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

      // Bold (**...**)
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

      // Italic (*...*)
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

      // Process lines into blocks
      const lines = html.split('\n');
      const result: string[] = [];
      let inList = false;
      let listType = '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Unordered list item
        if (/^[-*] (.+)/.test(trimmed)) {
          if (!inList || listType !== 'ul') {
            if (inList) result.push(`</${listType}>`);
            result.push('<ul>');
            inList = true;
            listType = 'ul';
          }
          result.push(`<li>${trimmed.replace(/^[-*] /, '')}</li>`);
          continue;
        }

        // Ordered list item
        if (/^\d+\. (.+)/.test(trimmed)) {
          if (!inList || listType !== 'ol') {
            if (inList) result.push(`</${listType}>`);
            result.push('<ol>');
            inList = true;
            listType = 'ol';
          }
          result.push(`<li>${trimmed.replace(/^\d+\. /, '')}</li>`);
          continue;
        }

        // Close any open list
        if (inList) {
          result.push(`</${listType}>`);
          inList = false;
          listType = '';
        }

        // Empty line = paragraph break
        if (!trimmed) {
          result.push('<br>');
        } else {
          result.push(trimmed);
        }
      }

      if (inList) result.push(`</${listType}>`);

      return result.join('\n');
    } catch {
      return value;
    }
  }
}
