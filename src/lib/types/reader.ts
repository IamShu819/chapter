export interface ReadingProgress {
  bookId: string;
  chapterIndex: number;
  scrollOffset: number;
  scrollRatio?: number;
  percentage: number;
  pdfZoom?: number;
  updatedAt: number;
}

export interface ReaderSettings {
  fontSize: number;
  fontFamily: 'serif' | 'sans' | 'mono';
  theme: 'light' | 'dark' | 'sepia';
  lineHeight: number;
  turnPageAnimation: 'slide' | 'fade' | 'none';
}
