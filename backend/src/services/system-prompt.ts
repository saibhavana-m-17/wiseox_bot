import { readFile } from 'fs/promises';
import { join } from 'path';

export interface ManifestEntry {
  url: string;
  filename: string;
  sourceTab: string;
  crawledAt: string;
  charCount?: number;
}

export interface Manifest {
  crawledAt: string;
  totalUrls: number;
  successCount: number;
  failedCount: number;
  entries: ManifestEntry[];
}

interface KBEntry {
  url: string;
  content: string;
  contentLower: string;
  filename: string;
}

const INSTRUCTIONS = `You are AccuShield Assist, an AI assistant for AccuShield — a visitor management system for senior living communities.

STRICT RULES:
- ONLY answer questions related to AccuShield features, setup, and procedures.
- ONLY use information from the knowledge base content provided below.
- If a question is NOT about AccuShield, respond with: "I can only help with AccuShield-related questions. Please ask me about AccuShield features, setup, or procedures."
- If a question IS about AccuShield but cannot be answered from the provided content, say: "I don't have that specific information in my knowledge base. Please contact AccuShield support for help."
- Do NOT answer general knowledge questions, recipes, coding questions, or anything unrelated to AccuShield.
- Do NOT use any emoji characters in your responses.

RESPONSE FORMAT:
- Answer in 3-5 short bullet points only. Nothing more.
- Each bullet should be one short sentence — the key action or fact.
- No paragraphs, no explanations, no introductions, no conclusions.
- Add references at the very end after the bullet points.

IMPORTANT: At the end of every response, include a "References" section listing the source URLs you used to answer the question. Format it as:

**References:**
- [Page Title or brief description](source_url)

Only include URLs from the "--- Source: URL ---" markers in the knowledge base content that were actually relevant to your answer.

`;

const MAX_CONTEXT_CHARS = 30_000;
const MAX_ENTRIES = 8;

export class SystemPromptBuilder {
  private knowledgeBasePath: string;
  private entries: KBEntry[] = [];
  private loaded = false;

  constructor(knowledgeBasePath: string) {
    this.knowledgeBasePath = knowledgeBasePath;
  }

  async build(): Promise<void> {
    const manifestPath = join(this.knowledgeBasePath, 'manifest.json');
    const manifestRaw = await readFile(manifestPath, 'utf-8');
    const manifest: Manifest = JSON.parse(manifestRaw);

    console.log(`[KB] Loading ${manifest.entries.length} knowledge base entries...`);

    for (const entry of manifest.entries) {
      const filePath = join(this.knowledgeBasePath, entry.filename);
      try {
        const content = await readFile(filePath, 'utf-8');
        if (content.trim().length > 10) {
          this.entries.push({
            url: entry.url,
            content: content.trim(),
            contentLower: content.toLowerCase(),
            filename: entry.filename,
          });
        }
      } catch (_) {}
    }

    this.loaded = true;
    console.log(`[KB] Loaded ${this.entries.length} entries into memory`);
  }

  getPromptForQuery(query: string): string {
    if (!this.loaded) throw new Error('KB not loaded. Call build() first.');

    const queryLower = query.toLowerCase();
    const queryWords = queryLower
      .split(/\s+/)
      .filter(w => w.length > 2)
      .filter(w => !['the', 'how', 'what', 'can', 'you', 'does', 'this', 'that', 'with', 'for', 'and', 'are', 'from', 'about'].includes(w));

    const scored = this.entries.map(entry => {
      let score = 0;
      for (const word of queryWords) {
        const idx = entry.contentLower.indexOf(word);
        if (idx !== -1) score += 3;
        if (entry.url.toLowerCase().includes(word)) score += 5;
        if (entry.filename.toLowerCase().includes(word)) score += 4;
      }
      if (entry.contentLower.includes(queryLower)) score += 20;
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topEntries = scored
      .filter(s => s.score > 0)
      .slice(0, MAX_ENTRIES);

    if (topEntries.length === 0) {
      console.log(`[KB] No keyword matches for: "${query}"`);
      return INSTRUCTIONS + '--- No relevant knowledge base entries found for this query ---\n';
    }

    let contextChars = 0;
    const blocks: string[] = [];

    for (const { entry, score } of topEntries) {
      const block = `--- Source: ${entry.url} ---\n${entry.content}\n`;
      if (contextChars + block.length > MAX_CONTEXT_CHARS) break;
      blocks.push(block);
      contextChars += block.length;
    }

    const prompt = INSTRUCTIONS + blocks.join('\n');
    console.log(`[KB] Query: "${query.substring(0, 50)}" → ${topEntries.length} entries, ${(prompt.length / 1024).toFixed(0)}KB`);

    return prompt;
  }

  getPrompt(): string {
    return this.getPromptForQuery('');
  }
}
