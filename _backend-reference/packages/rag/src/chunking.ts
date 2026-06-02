import { detectLanguage, type DocumentChunk } from "@mp/shared";
import { classifyText } from "./taxonomy.js";

export interface ChunkDocumentInput {
  documentId: string;
  title: string;
  version: number;
  text: string;
  language?: string;
}

export function chunkDocument(input: ChunkDocumentInput): DocumentChunk[] {
  const paragraphs = input.text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: DocumentChunk[] = [];
  let offset = 0;

  paragraphs.forEach((paragraph, index) => {
    const text = paragraph.length > 1200 ? paragraph.slice(0, 1200) : paragraph;
    const tags = classifyText(text);
    const charStart = input.text.indexOf(paragraph, offset);
    const charEnd = charStart + text.length;
    offset = charEnd;
    chunks.push({
      id: `${input.documentId}-chunk-${index + 1}`,
      documentId: input.documentId,
      version: input.version,
      text,
      language: input.language ?? detectLanguage(text),
      page: index + 1,
      section: inferSection(text, index),
      paragraph: index + 1,
      charStart,
      charEnd,
      timeStart: null,
      timeEnd: null,
      industryTags: tags.industryTags,
      pmDomainTags: tags.pmDomainTags,
      vectorId: `${input.documentId}-vec-${index + 1}`,
      sourceUri: `/source/${input.documentId}-chunk-${index + 1}`,
      title: input.title,
      createdAt: new Date().toISOString()
    });
  });

  return chunks;
}

function inferSection(text: string, index: number): string {
  const heading = text.split("\n")[0]?.replace(/^#+\s*/, "").trim();
  if (heading && heading.length < 80) return heading;
  return `Section ${index + 1}`;
}
