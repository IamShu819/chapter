import type { Book } from '../types/book';
import type { ReadingProgress, ReaderSettings } from '../types/reader';
import type { Bookmark } from '../types/bookmark';
import type { VocabEntry } from '../types/vocabulary';
import type { Annotation } from '../types/annotation';
import { db } from '../db';
import { generateCoverGradient, generateCoverImage } from '../utils/cover';
import { detectFormat, readFileAsArrayBuffer, readFileAsText } from '../utils/file-import';

// ===== Book Store =====

class BookStore {
  books = $state<Book[]>([]);
  loading = $state(false);

  async loadAll() {
    this.loading = true;
    try {
      const books = await db.books.toArray();
      books.sort((a, b) => b.lastReadAt - a.lastReadAt);

      // Migrate: generate covers for books that don't have them (batch update)
      let needsUpdate = false;
      for (const book of books) {
        if (!book.coverBlob) {
          try {
            book.coverBlob = await generateCoverImage(book.title, book.author);
            await db.books.update(book.id, { coverBlob: book.coverBlob });
            needsUpdate = true;
          } catch (e) {
            console.warn('Cover generation failed for:', book.title, e);
          }
        }
      }
      // Single reassignment to trigger one reactive update
      this.books = needsUpdate ? [...books] : books;
    } finally {
      this.loading = false;
    }
  }

  async addBook(file: File): Promise<Book> {
    const format = detectFormat(file.name);
    if (!format) throw new Error(`不支持的格式: ${file.name}`);

    const id = crypto.randomUUID();
    const title = file.name.replace(/\.[^.]+$/, '');
    const fileBlob = file;

    const book: Book = {
      id,
      title,
      author: '未知',
      format,
      coverGradient: generateCoverGradient(title),
      fileBlob,
      fileSize: file.size,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      metadata: {},
      chapters: [],
    };

    // Extract epub metadata using epub-parser
    if (format === 'epub') {
      try {
        const { parseEpub } = await import('../parsers/epub-parser');
        const epub = await parseEpub(file, { includeHtml: false });
        if (epub.title) book.title = epub.title;
        if (epub.author) book.author = epub.author;
        if (epub.chapters.length > 0) {
          book.chapters = epub.chapters.map(ch => ({
            id: ch.id,
            title: ch.title,
            href: ch.href,
            startOffset: 0,
            endOffset: 0,
            order: ch.order,
          }));
        }
        if (epub.coverBlob) book.coverBlob = epub.coverBlob;
      } catch (e) {
        console.warn('EPUB metadata extraction failed:', e);
      }
    }

    // Parse txt chapters
    if (format === 'txt') {
      const text = await readFileAsText(file);
      book.chapters = parseTxtChapters(text);
    }

    // Parse md chapters
    if (format === 'md') {
      const text = await readFileAsText(file);
      book.chapters = parseMdChapters(text);
    }

    // Parse docx — use byte offsets into the converted HTML (re-parsed on read)
    if (format === 'docx') {
      try {
        const buf = await readFileAsArrayBuffer(file);
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        book.chapters = parseDocxChapters(result.value);
      } catch (e) {
        console.warn('DOCX parsing failed:', e);
        // Fallback: single chapter with the raw file
        book.chapters = [{
          id: 'ch-0',
          title: '文档',
          href: '',
          startOffset: 0,
          endOffset: 0,
          order: 0,
        }];
      }
    }

    // Parse pdf
    if (format === 'pdf') {
      try {
        const buf = await readFileAsArrayBuffer(file);
        const pdfjs = await import('../parsers/pdf-worker').then(m => m.default);
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const numPages = doc.numPages;
        const pagesPerChapter = 10;
        for (let i = 0; i < numPages; i += pagesPerChapter) {
          const end = Math.min(i + pagesPerChapter, numPages);
          book.chapters.push({
            id: `pages-${i}-${end}`,
            title: `第 ${i + 1} - ${end} 页`,
            href: '',
            startOffset: i,
            endOffset: end,
            order: i / pagesPerChapter,
          });
        }
      } catch (e) {
        console.warn('PDF metadata extraction failed:', e);
      }
    }

    // Generate canvas cover if no embedded cover
    if (!book.coverBlob) {
      try {
        book.coverBlob = await generateCoverImage(book.title, book.author);
      } catch (e) {
        console.warn('Cover generation failed:', e);
      }
    }

    await db.books.add(book);
    this.books.unshift(book);
    return book;
  }

  async deleteBook(id: string) {
    await db.books.delete(id);
    await db.progress.delete(id);
    await db.bookmarks.where('bookId').equals(id).delete();
    await db.vocabulary.where('bookId').equals(id).delete();
    await db.annotations.where('bookId').equals(id).delete();
    this.books = this.books.filter(b => b.id !== id);
    bookmarkStore.removeByBook(id);
    vocabStore.removeByBook(id);
    annotationStore.removeByBook(id);
  }

  async updateBook(id: string, data: { title?: string; author?: string }) {
    await db.books.update(id, data);
    const book = this.books.find(b => b.id === id);
    if (book) {
      if (data.title !== undefined) book.title = data.title;
      if (data.author !== undefined) book.author = data.author;
    }
  }

  async updateLastRead(id: string) {
    await db.books.update(id, { lastReadAt: Date.now() });
    const book = this.books.find(b => b.id === id);
    if (book) book.lastReadAt = Date.now();
  }

  search(query: string): Book[] {
    if (!query.trim()) return this.books;
    const q = query.toLowerCase();
    return this.books.filter(
      b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }
}

function parseTxtChapters(text: string) {
  const chapterRegex = /^(第.{1,10}[章回节篇]|Chapter\s+\d+|CHAPTER\s+\d+)/gm;
  const matches: { title: string; index: number }[] = [];
  let m;
  while ((m = chapterRegex.exec(text)) !== null) {
    matches.push({ title: m[1], index: m.index });
  }

  if (matches.length === 0) {
    const chunkSize = 5000;
    const chapters = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chapters.push({
        id: `chunk-${i}`,
        title: `第 ${chapters.length + 1} 部分`,
        href: '',
        startOffset: i,
        endOffset: Math.min(i + chunkSize, text.length),
        order: chapters.length,
      });
    }
    return chapters;
  }

  return matches.map((match, i) => ({
    id: `ch-${i}`,
    title: match.title,
    href: '',
    startOffset: match.index,
    endOffset: i < matches.length - 1 ? matches[i + 1].index : text.length,
    order: i,
  }));
}

function parseMdChapters(text: string) {
  const headingRegex = /^(#{1,2})\s+(.+)/gm;
  const matches: { title: string; level: number; index: number }[] = [];
  let m;
  while ((m = headingRegex.exec(text)) !== null) {
    matches.push({ title: m[2], level: m[1].length, index: m.index });
  }

  if (matches.length === 0) {
    return [{
      id: 'ch-0',
      title: '文档',
      href: '',
      startOffset: 0,
      endOffset: text.length,
      order: 0,
    }];
  }

  return matches.map((match, i) => ({
    id: `ch-${i}`,
    title: match.title,
    href: '',
    startOffset: match.index,
    endOffset: i < matches.length - 1 ? matches[i + 1].index : text.length,
    order: i,
  }));
}

function parseDocxChapters(html: string) {
  // Split HTML by h1/h2/h3 headings
  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  const matches: { title: string; index: number }[] = [];
  let m;
  while ((m = headingRegex.exec(html)) !== null) {
    // Strip HTML tags from heading text
    const title = m[1].replace(/<[^>]+>/g, '').trim() || `第 ${matches.length + 1} 章`;
    matches.push({ title, index: m.index });
  }

  if (matches.length === 0) {
    return [{
      id: 'ch-0',
      title: '文档',
      href: '',
      startOffset: 0,
      endOffset: html.length,
      order: 0,
    }];
  }

  return matches.map((match, i) => ({
    id: `ch-${i}`,
    title: match.title,
    href: '',
    startOffset: match.index,
    endOffset: i < matches.length - 1 ? matches[i + 1].index : html.length,
    order: i,
  }));
}

// ===== Progress Store =====

class ProgressStore {
  progressMap = $state<Map<string, ReadingProgress>>(new Map());
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private storagePrefix = 'chapter-progress:';

  async loadAll() {
    const all = await db.progress.toArray();
    this.progressMap = new Map(all.map(p => [p.bookId, p]));
    this.loadLocalBackups();
  }

  get(bookId: string): ReadingProgress | undefined {
    return this.progressMap.get(bookId);
  }

  save(bookId: string, progress: Omit<ReadingProgress, 'bookId' | 'updatedAt'>) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const record: ReadingProgress = {
      bookId,
      ...progress,
      updatedAt: Date.now(),
    };
    this.progressMap.set(bookId, record);
    this.saveLocalBackup(record);
    this.saveTimer = setTimeout(async () => {
      await db.progress.put(record);
    }, 1000);
  }

  async saveNow(bookId: string, progress: Omit<ReadingProgress, 'bookId' | 'updatedAt'>) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const record: ReadingProgress = {
      bookId,
      ...progress,
      updatedAt: Date.now(),
    };
    this.progressMap.set(bookId, record);
    this.saveLocalBackup(record);
    await db.progress.put(record);
  }

  dispose() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private saveLocalBackup(record: ReadingProgress) {
    try {
      localStorage.setItem(`${this.storagePrefix}${record.bookId}`, JSON.stringify(record));
    } catch {}
  }

  private loadLocalBackups() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(this.storagePrefix)) continue;
        const record = JSON.parse(localStorage.getItem(key) || '') as ReadingProgress;
        const saved = this.progressMap.get(record.bookId);
        if (!saved || record.updatedAt > saved.updatedAt) {
          this.progressMap.set(record.bookId, record);
          void db.progress.put(record);
        }
      }
    } catch {}
  }
}

// ===== Settings Store =====

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: 'serif',
  theme: 'light',
  lineHeight: 1.8,
  turnPageAnimation: 'slide',
};

class SettingsStore {
  settings = $state<ReaderSettings>({ ...DEFAULT_SETTINGS });

  async load() {
    const saved = await db.settings.get('reader');
    if (saved?.value) {
      this.settings = { ...DEFAULT_SETTINGS, ...saved.value };
    }
    this.applyTheme();
  }

  async update(partial: Partial<ReaderSettings>) {
    this.settings = { ...this.settings, ...partial };
    await db.settings.put({ key: 'reader', value: this.settings });
    if (partial.theme) this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-theme', this.settings.theme);
    const colors: Record<string, string> = {
      light: '#2D6A4F',
      dark: '#121212',
      sepia: '#F5E6D3',
    };
    const bg = colors[this.settings.theme] || colors['light'];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
    // Update Capacitor StatusBar on Android
    import('@capacitor/status-bar').then(({ StatusBar }) => {
      StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
      StatusBar.setStyle({ style: this.settings.theme === 'dark' ? 'dark' : 'light' }).catch(() => {});
    }).catch(() => {});
  }
}

// ===== Bookmark Store =====

class BookmarkStore {
  bookmarks = $state<Bookmark[]>([]);

  async loadAll() {
    this.bookmarks = await db.bookmarks.toArray();
    this.bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(bookmark: Bookmark) {
    await db.bookmarks.add(bookmark);
    this.bookmarks.unshift(bookmark);
  }

  async remove(id: string) {
    await db.bookmarks.delete(id);
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
  }

  getByBook(bookId: string): Bookmark[] {
    return this.bookmarks.filter(b => b.bookId === bookId);
  }

  hasAtPosition(bookId: string, chapterIndex: number): Bookmark | undefined {
    return this.bookmarks.find(b => b.bookId === bookId && b.chapterIndex === chapterIndex);
  }

  removeByBook(bookId: string) {
    this.bookmarks = this.bookmarks.filter(b => b.bookId !== bookId);
  }
}

// ===== Vocabulary Store =====

class VocabStore {
  entries = $state<VocabEntry[]>([]);

  async loadAll() {
    this.entries = await db.vocabulary.toArray();
    this.entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(entry: VocabEntry) {
    await db.vocabulary.add(entry);
    this.entries.unshift(entry);
  }

  async remove(id: string) {
    await db.vocabulary.delete(id);
    this.entries = this.entries.filter(e => e.id !== id);
  }

  has(character: string, bookId: string): boolean {
    return this.entries.some(e => e.character === character && e.bookId === bookId);
  }

  removeByBook(bookId: string) {
    this.entries = this.entries.filter(e => e.bookId !== bookId);
  }
}

// ===== Annotation Store =====

class AnnotationStore {
  entries = $state<Annotation[]>([]);

  async loadAll() {
    this.entries = await db.annotations.toArray();
    this.entries.sort((a, b) => b.createdAt - a.createdAt);
  }

  async add(annotation: Annotation) {
    await db.annotations.add(annotation);
    this.entries.unshift(annotation);
  }

  async remove(id: string) {
    await db.annotations.delete(id);
    this.entries = this.entries.filter(e => e.id !== id);
  }

  getByBook(bookId: string): Annotation[] {
    return this.entries.filter(e => e.bookId === bookId);
  }

  getByChapter(bookId: string, chapterIndex: number): Annotation[] {
    return this.entries.filter(e => e.bookId === bookId && e.chapterIndex === chapterIndex);
  }

  removeByBook(bookId: string) {
    this.entries = this.entries.filter(e => e.bookId !== bookId);
  }
}

// ===== Instances =====

export const bookStore = new BookStore();
export const progressStore = new ProgressStore();
export const settingsStore = new SettingsStore();
export const bookmarkStore = new BookmarkStore();
export const vocabStore = new VocabStore();
export const annotationStore = new AnnotationStore();

// ===== Navigation =====

export type Page = 'bookshelf' | 'vocab' | 'import' | 'settings' | 'reader';

class NavStore {
  currentPage = $state<Page>('bookshelf');
  currentBookId = $state<string | null>(null);

  navigate(page: Page, bookId?: string) {
    this.currentPage = page;
    this.currentBookId = bookId ?? null;
  }
}

export const nav = new NavStore();
