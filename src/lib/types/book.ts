export interface ChapterMeta {
  id: string;
  title: string;
  href: string;
  startOffset: number;
  endOffset: number;
  order: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'txt' | 'pdf' | 'md' | 'docx';
  coverGradient: string;
  coverBlob?: Blob;
  fileBlob: Blob;
  fileSize: number;
  addedAt: number;
  lastReadAt: number;
  metadata: Record<string, string>;
  chapters: ChapterMeta[];
}

export type BookFormat = Book['format'];
