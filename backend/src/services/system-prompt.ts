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

const INSTRUCTIONS_HEADER = `You are WiseOx, an AI assistant. Answer questions based ONLY on the following knowledge base content. If a question cannot be answered from the provided content, clearly state that you don't have that information in your knowledge base.

IMPORTANT: At the end of every response, include a "References" section listing the source URLs you used to answer the question. Format it as:

**References:**
- [Page Title or brief description](source_url)

Only include URLs from the "--- Source: URL ---" markers in the knowledge base content that were actually relevant to your answer.\n\n`;

const MAX_TOKEN_ESTIMATE = 180_000;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = MAX_TOKEN_ESTIMATE * CHARS_PER_TOKEN; // 720,000

export class SystemPromptBuilder {
  private knowledgeBasePath: string;
  private cachedPrompt: string | null = null;

  constructor(knowledgeBasePath: string) {
    this.knowledgeBasePath = knowledgeBasePath;
  }

  async build(): Promise<string> {
    const manifestPath = join(this.knowledgeBasePath, 'manifest.json');
    const manifestRaw = await readFile(manifestPath, 'utf-8');
    const manifest: Manifest = JSON.parse(manifestRaw);

    // Sort entries by crawledAt ascending (oldest first)
    const sortedEntries = [...manifest.entries].sort(
      (a, b) => new Date(a.crawledAt).getTime() - new Date(b.crawledAt).getTime()
    );

    // Load content for each entry
    const blocks: { entry: ManifestEntry; block: string }[] = [];
    for (const entry of sortedEntries) {
      const filePath = join(this.knowledgeBasePath, entry.filename);
      const content = await readFile(filePath, 'utf-8');
      const block = `--- Source: ${entry.url} ---\n${content}\n`;
      blocks.push({ entry, block });
    }

    // Build prompt respecting token limit
    // Start with the instructions header, then add content blocks newest-first
    // (drop oldest entries first if over limit)
    const headerLength = INSTRUCTIONS_HEADER.length;
    let availableChars = MAX_CHARS - headerLength;

    // We want to keep the newest entries and drop the oldest.
    // Blocks are sorted oldest-first, so iterate from the end (newest) backwards.
    const includedBlocks: string[] = [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const blockLength = blocks[i].block.length;
      if (blockLength <= availableChars) {
        includedBlocks.unshift(blocks[i].block);
        availableChars -= blockLength;
      }
      // If this block doesn't fit, skip it (it's an older entry)
    }

    const prompt = INSTRUCTIONS_HEADER + includedBlocks.join('\n');
    this.cachedPrompt = prompt;
    return prompt;
  }

  getPrompt(): string {
    if (this.cachedPrompt === null) {
      throw new Error(
        'System prompt has not been built yet. Call build() first.'
      );
    }
    return this.cachedPrompt;
  }
}
