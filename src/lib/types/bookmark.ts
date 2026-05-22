export interface Bookmark {
  id: string;
  bookId: string;
  chapterIndex: number;
  scrollOffset: number;
  scrollRatio?: number;
  selectedText: string;
  note: string;
  createdAt: number;
}
