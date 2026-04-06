import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    try {
      // Strip emoji characters from the response
      let html = value.replace(/\p{Emoji_Presentation}/gu, '').replace(/\p{Extended_Pictographic}/gu, '');

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

      // Headings
      html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
      html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

      const lines = html.split('\n');
      const result: string[] = [];
      let inList = false;
      let listType = '';

      const isOl = (s: string) => /^\d+\.\s/.test(s);
      const isUl = (s: string) => /^[-*]\s/.test(s);

      const nextNonEmpty = (from: number): string => {
        for (let j = from; j < lines.length; j++) {
          if (lines[j].trim()) return lines[j].trim();
        }
        return '';
      };

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (isUl(trimmed)) {
          if (!inList || listType !== 'ul') {
            if (inList) result.push('</' + listType + '>');
            result.push('<ul>');
            inList = true;
            listType = 'ul';
          }
          result.push('<li>' + trimmed.replace(/^[-*]\s/, '') + '</li>');
          continue;
        }

        if (isOl(trimmed)) {
          if (!inList || listType !== 'ol') {
            if (inList) result.push('</' + listType + '>');
            result.push('<ol>');
            inList = true;
            listType = 'ol';
          }
          result.push('<li>' + trimmed.replace(/^\d+\.\s/, '') + '</li>');
          continue;
        }

        if (!trimmed && inList) {
          const next = nextNonEmpty(i + 1);
          if ((listType === 'ol' && isOl(next)) || (listType === 'ul' && isUl(next))) {
            continue;
          }
          result.push('</' + listType + '>');
          inList = false;
          listType = '';
          continue;
        }

        if (inList) {
          result.push('</' + listType + '>');
          inList = false;
          listType = '';
        }

        if (!trimmed) {
          // Skip consecutive blank lines and blank lines before headings
          if (result.length > 0 && result[result.length - 1] === '<br>') continue;
          const next = nextNonEmpty(i + 1);
          if (next.startsWith('<h')) continue;
          result.push('<br>');
        } else {
          result.push(trimmed);
        }
      }

      if (inList) result.push('</' + listType + '>');

      return result.join('\n');
    } catch {
      return value;
    }
  }
}
