import Dexie, { type Table } from 'dexie';
import type { Book } from '../types/book';
import type { ReadingProgress } from '../types/reader';
import type { Bookmark } from '../types/bookmark';
import type { VocabEntry } from '../types/vocabulary';
import type { Annotation } from '../types/annotation';

class ChapterDB extends Dexie {
  books!: Table<Book, string>;
  progress!: Table<ReadingProgress, string>;
  settings!: Table<{ key: string; value: any }, string>;
  bookmarks!: Table<Bookmark, string>;
  vocabulary!: Table<VocabEntry, string>;
  annotations!: Table<Annotation, string>;

  constructor() {
    super('chapter-db');
    this.version(1).stores({
      books: 'id, title, author, format, addedAt, lastReadAt',
      progress: 'bookId, updatedAt',
      settings: 'key'
    });
    this.version(2).stores({
      books: 'id, title, author, format, addedAt, lastReadAt',
      progress: 'bookId, updatedAt',
      settings: 'key',
      bookmarks: 'id, bookId, chapterIndex, createdAt',
      vocabulary: 'id, character, bookId, createdAt'
    });
    this.version(3).stores({
      books: 'id, title, author, format, addedAt, lastReadAt',
      progress: 'bookId, updatedAt',
      settings: 'key',
      bookmarks: 'id, bookId, chapterIndex, createdAt',
      vocabulary: 'id, character, bookId, createdAt',
      annotations: 'id, bookId, chapterIndex, createdAt'
    });
  }
}

export const db = new ChapterDB();
