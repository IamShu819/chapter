<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { bookStore, nav, progressStore, settingsStore, bookmarkStore, vocabStore, annotationStore } from '../lib/stores/app.svelte';
  import { loadDictionary, lookup } from '../lib/dictionary/engine';
  import type { Book } from '../lib/types/book';
  import type { LookupResult } from '../lib/types/dictionary';
  import type { Bookmark } from '../lib/types/bookmark';
  import type { Annotation } from '../lib/types/annotation';
  import DictPopup from '../components/reader/DictPopup.svelte';
  import BookmarkDrawer from '../components/reader/BookmarkDrawer.svelte';
  import AnnotationDrawer from '../components/reader/AnnotationDrawer.svelte';

  let book = $state<Book | null>(null);
  let readerContent = $state('');
  let originalReaderContent = $state('');
  let currentChapter = $state(0);
  let showControls = $state(true);
  let showChapterNav = $state(false);
  let dictResult = $state<LookupResult | null>(null);
  let dictPos = $state({ x: 0, y: 0 });
  let progress = $state(0);
  let loading = $state(true);
  let errorMsg = $state('');
  let contentEl = $state<HTMLDivElement | null>(null);

  // Bookmark state
  let showBookmarks = $state(false);

  // Annotation state
  let showAnnotations = $state(false);
  let selectionToolbar = $state<{ x: number; y: number; text: string } | null>(null);
  let notePopup = $state<{ text: string; note: string; editingId?: string } | null>(null);
  let viewingAnnotation = $state<Annotation | null>(null);

  // Search state
  let showSearch = $state(false);
  let searchQuery = $state('');
  let searchMatchCount = $state(0);
  let currentMatchIndex = $state(0);
  let isComposing = $state(false);
  let showEditBook = $state(false);
  let editTitle = $state('');
  let editAuthor = $state('');
  let pdfZoom = $state(1);
  let pdfHasImages = $state(false);
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let saveTimer: ReturnType<typeof setTimeout>;
  let controlsTimer: ReturnType<typeof setTimeout>;
  let scrollTimers: ReturnType<typeof setTimeout>[] = [];
  let scrollRaf: number | null = null;
  let restoringScroll = $state(false);
  let debugInfo = $state('');
  const debugReader = new URLSearchParams(window.location.search).has('debugReader');
  const persistCurrentPosition = () => { void saveProgressNow(); };
  const handleWindowScroll = () => handleScroll();
  let protectedRestoreOffset = 0;
  let protectRestoreUntil = 0;
  let savedOnExit = false;

  onMount(async () => {
    const bookId = nav.currentBookId;
    if (!bookId) {
      nav.navigate('bookshelf');
      return;
    }

    book = bookStore.books.find(b => b.id === bookId) || null;
    if (!book) {
      nav.navigate('bookshelf');
      return;
    }

    await bookStore.updateLastRead(book.id);
    await loadDictionary();

    // Restore progress — read directly from localStorage (progressStore may not be loaded yet)
    const saved = getImmediateSavedProgress(book.id) || progressStore.get(book.id);
    if (saved) {
      currentChapter = saved.chapterIndex;
    }

    loading = false;
    await tick();
    await loadContent();

    // Wait for contentEl to be bound (DOM update from loading=false may lag)
    const waitForEl = performance.now();
    while (!contentEl && performance.now() - waitForEl < 3000) {
      await tick();
      await new Promise(r => setTimeout(r, 50));
    }

    if (saved && (saved.scrollOffset || saved.scrollRatio) && contentEl) {
      protectedRestoreOffset = saved.scrollOffset;
      protectRestoreUntil = performance.now() + 5000;
      await restoreScroll(saved.scrollOffset, saved.scrollRatio);
      scrollTimers.push(setTimeout(() => { void restoreScroll(saved.scrollOffset, saved.scrollRatio); }, 300));
      scrollTimers.push(setTimeout(() => { void restoreScroll(saved.scrollOffset, saved.scrollRatio); }, 900));
      scrollTimers.push(setTimeout(() => { void restoreScroll(saved.scrollOffset, saved.scrollRatio); }, 1800));
    }

    window.addEventListener('pagehide', persistCurrentPosition);
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    document.addEventListener('visibilitychange', persistCurrentPosition);
  });

  onDestroy(() => {
    if (!savedOnExit) void saveProgressNow();
    window.removeEventListener('pagehide', persistCurrentPosition);
    window.removeEventListener('scroll', handleWindowScroll);
    document.removeEventListener('visibilitychange', persistCurrentPosition);
    clearTimeout(saveTimer);
    clearTimeout(controlsTimer);
    scrollTimers.forEach(clearTimeout);
    scrollTimers = [];
    if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
    progressStore.dispose();
  });

  async function loadContent() {
    if (!book) return;
    errorMsg = '';
    pdfHasImages = false;

    try {
      if (book.format === 'epub') {
        await loadEpub();
      } else if (book.format === 'txt') {
        await loadTxt();
      } else if (book.format === 'md') {
        await loadMd();
      } else if (book.format === 'pdf') {
        await loadPdf();
      } else if (book.format === 'docx') {
        await loadDocx();
      }
    } catch (e: any) {
      console.error('Load error:', e);
      errorMsg = e.message || '加载失败';
    }
    originalReaderContent = '';
    clearSearch();
  }

  async function restoreScroll(scrollOffset: number, scrollRatio?: number) {
    restoringScroll = true;
    await tick();
    const startedAt = performance.now();

    while (contentEl && performance.now() - startedAt < 2500) {
      const maxScroll = getReaderScrollableSize().maxScroll;
      if (maxScroll > 0 && (scrollRatio !== undefined || maxScroll >= Math.min(scrollOffset, 200))) break;
      await new Promise(requestAnimationFrame);
    }

    if (!contentEl) {
      restoringScroll = false;
      return;
    }

    for (let i = 0; i < 40; i++) {
      await new Promise(requestAnimationFrame);
      if (!contentEl) break;
      const target = resolveRestoreOffset(scrollOffset, scrollRatio);
      setReaderScrollTop(target);
      updateDebugInfo();
      if (Math.abs(getReaderScrollTop() - target) < 4) break;
    }

    restoringScroll = false;
  }

  function getReaderScrollTop(): number {
    const elScroll = contentEl?.scrollTop || 0;
    const pageScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    return Math.max(elScroll, pageScroll);
  }

  function progressStorageKey(bookId: string) {
    return `chapter-progress:${bookId}`;
  }

  function getImmediateSavedProgress(bookId: string) {
    try {
      const raw = localStorage.getItem(progressStorageKey(bookId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveImmediateProgress(bookId: string, record: {
    chapterIndex: number;
    scrollOffset: number;
    scrollRatio?: number;
    percentage: number;
  }) {
    try {
      const data = { bookId, ...record, updatedAt: Date.now() };
      localStorage.setItem(progressStorageKey(bookId), JSON.stringify(data));
    } catch {}
  }

  function getReaderScrollableSize() {
    const elMax = contentEl ? contentEl.scrollHeight - contentEl.clientHeight : 0;
    const pageMax = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      document.body.scrollHeight - window.innerHeight,
      0
    );
    return {
      maxScroll: Math.max(elMax, pageMax, 0),
      scrollHeight: Math.max(contentEl?.scrollHeight || 0, document.documentElement.scrollHeight, document.body.scrollHeight),
      clientHeight: Math.max(contentEl?.clientHeight || 0, window.innerHeight),
    };
  }

  function setReaderScrollTop(scrollOffset: number) {
    const { maxScroll } = getReaderScrollableSize();
    const target = Math.min(scrollOffset, maxScroll);
    if (contentEl && contentEl.scrollHeight > contentEl.clientHeight) {
      contentEl.scrollTop = target;
    }
    window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    document.documentElement.scrollTop = target;
    document.body.scrollTop = target;
  }

  function resolveRestoreOffset(scrollOffset: number, scrollRatio?: number): number {
    const { maxScroll } = getReaderScrollableSize();
    if (scrollRatio !== undefined && Number.isFinite(scrollRatio)) {
      return Math.max(0, Math.min(maxScroll, maxScroll * scrollRatio));
    }
    return scrollOffset;
  }

  async function loadEpub() {
    if (!book) return;
    const { parseEpub } = await import('../lib/parsers/epub-parser');
    const epubFile = book.fileBlob instanceof File
      ? book.fileBlob
      : new File([book.fileBlob], `${book.title}.epub`, { type: 'application/epub+zip' });
    const epub = await parseEpub(epubFile, { chapterIndex: currentChapter });

    // Update metadata if we got better info
    if (epub.title && epub.title !== book.title) {
      book.title = epub.title;
      await db.books.update(book.id, { title: epub.title });
    }
    if (epub.author && epub.author !== book.author) {
      book.author = epub.author;
      await db.books.update(book.id, { author: epub.author });
    }

    // Update chapters from parsed TOC
    if (epub.chapters.length > 0) {
      book.chapters = epub.chapters.map((ch, i) => ({
        id: ch.id,
        title: ch.title,
        href: ch.href,
        startOffset: 0,
        endOffset: 0,
        order: ch.order,
      }));
    }

    // Render current chapter
    const ch = epub.chapters[currentChapter];
    if (ch) {
      const DOMPurify = (await import('dompurify')).default;
      readerContent = DOMPurify.sanitize(ch.html, {
        ADD_ATTR: ['xlink:href'],
        ADD_URI_SAFE_PROTOCOLS: ['data'],
      });
    } else {
      readerContent = '<p>当前章节没有可显示内容。</p>';
    }
  }

  async function loadTxt() {
    if (!book) return;
    const text = await book.fileBlob.text();
    const ch = book.chapters[currentChapter];
    if (ch) {
      const content = text.slice(ch.startOffset, ch.endOffset);
      readerContent = content.split('\n').map(p => `<p>${escapeHtml(p) || '&nbsp;'}</p>`).join('');
    } else {
      readerContent = '<p>当前章节没有可显示内容。</p>';
    }
  }

  async function loadMd() {
    if (!book) return;
    const text = await book.fileBlob.text();
    const ch = book.chapters[currentChapter];
    if (ch) {
      const content = text.slice(ch.startOffset, ch.endOffset);
      const { marked } = await import('marked');
      const DOMPurify = (await import('dompurify')).default;
      const html = await marked.parse(content);
      readerContent = DOMPurify.sanitize(html, {
        ADD_URI_SAFE_PROTOCOLS: ['data'],
      });
    } else {
      readerContent = '<p>当前章节没有可显示内容。</p>';
    }
  }

  async function loadPdf() {
    if (!book) return;
    const buf = await book.fileBlob.arrayBuffer();
    const pdfjs = await import('../lib/parsers/pdf-worker').then(m => m.default);

    const doc = await pdfjs.getDocument({
      data: buf,
      useWorkerFetch: false,
      cMapUrl: '/cmaps/',
      cMapPacked: true,
    } as any).promise;

    const ch = book.chapters[currentChapter];
    if (!ch) return;

    let html = '';
    let hasImages = false;
    for (let i = ch.startOffset; i < ch.endOffset; i++) {
      const page = await doc.getPage(i + 1);
      html += `<div class="pdf-page" data-page="${i + 1}"><p class="pdf-page-num">— 第 ${i + 1} 页 —<button class="pdf-note-btn" data-add-note="${i + 1}" title="添加笔记"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button></p>`;

      // Try text extraction with layout reconstruction
      const content = await page.getTextContent({ normalizeWhitespace: true } as any);
      const items = content.items as any[];
      const pageText = reconstructPdfLayout(items);

      if (pageText.length > 5) {
        html += pageText;
      } else {
        // No text — render page as canvas image
        try {
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          html += `<img src="${dataUrl}" class="pdf-canvas-page" alt="第 ${i + 1} 页" />`;
          canvas.width = 0; canvas.height = 0;
          hasImages = true;
        } catch {
          html += `<p class="pdf-empty-page">（无法渲染此页）</p>`;
        }
      }

      html += '</div>';
    }
    pdfHasImages = hasImages;
    readerContent = html;

    // Restore saved zoom
    if (hasImages && book) {
      const saved = parseFloat(localStorage.getItem(`chapter-pdf-zoom:${book.id}`) || '1');
      if (saved > 1) {
        await tick();
        setPdfZoom(saved);
      } else {
        pdfZoom = 1;
      }
    } else {
      pdfZoom = 1;
    }
  }

  async function loadDocx() {
    if (!book) return;
    const buf = await book.fileBlob.arrayBuffer();
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = result.value;
    const ch = book.chapters[currentChapter];
    if (ch && ch.endOffset > 0) {
      const content = html.slice(ch.startOffset, ch.endOffset);
      const DOMPurify = (await import('dompurify')).default;
      readerContent = DOMPurify.sanitize(content, {
        ADD_URI_SAFE_PROTOCOLS: ['data'],
      });
    } else if (ch) {
      // Fallback: show entire document as single chapter
      const DOMPurify = (await import('dompurify')).default;
      readerContent = DOMPurify.sanitize(html, {
        ADD_URI_SAFE_PROTOCOLS: ['data'],
      });
    } else {
      readerContent = '<p>当前章节没有可显示内容。</p>';
    }
  }

  // PDF zoom controls — use content width instead of transform for smooth transitions
  function setPdfZoom(z: number) {
    const oldZoom = pdfZoom;
    pdfZoom = Math.max(1, Math.min(4, z));
    if (contentEl) {
      const parent = contentEl.parentElement;
      if (pdfZoom > 1) {
        contentEl.style.width = `${pdfZoom * 100}%`;
        if (parent) {
          parent.style.overflowX = 'auto';
          parent.style.overflowY = 'auto';
          parent.style.height = '100%';
          // Center zoom on viewport midpoint
          const ratio = pdfZoom / oldZoom;
          parent.scrollLeft = parent.scrollLeft * ratio + parent.clientWidth * (ratio - 1) / 2;
          parent.scrollTop = parent.scrollTop * ratio + parent.clientHeight * (ratio - 1) / 2;
        }
      } else {
        resetPdfZoom();
      }
    }
    // Persist zoom per book
    if (book) {
      try { localStorage.setItem(`chapter-pdf-zoom:${book.id}`, String(pdfZoom)); } catch {}
    }
  }

  function resetPdfZoom() {
    pdfZoom = 1;
    if (contentEl) {
      contentEl.style.width = '';
      const parent = contentEl.parentElement;
      if (parent) {
        parent.style.overflowX = '';
        parent.style.overflowY = '';
        parent.style.height = '';
      }
    }
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZoom = pdfZoom;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDist;
      setPdfZoom(pinchStartZoom * scale);
    }
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cleanPdfText(text: string): string {
    const cleaned = text
      .replace(/\u0000/g, '')
      .replace(/[\uFFFD�]{2,}/g, ' ')
      .replace(/([一-龥])\s+(?=[一-龥])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    const badChars = (cleaned.match(/[\uFFFD�□]{1}/g) || []).length;
    if (cleaned.length > 0 && badChars / cleaned.length > 0.08) return '';
    return cleaned;
  }

  function reconstructPdfLayout(items: any[]): string {
    if (items.length === 0) return '';

    // Filter out empty items and extract position info
    const entries = items
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width || 0,
        height: item.height || item.transform[3] || 0,
      }));

    if (entries.length === 0) return '';

    // Sort by Y (top to bottom, pdf.js Y is bottom-up so negate)
    entries.sort((a, b) => b.y - a.y || a.x - b.x);

    // Group into lines by Y proximity (items within ~half line height)
    const avgHeight = entries.reduce((s, e) => s + e.height, 0) / entries.length || 12;
    const lineThreshold = avgHeight * 0.6;

    type Line = { items: typeof entries; avgY: number };
    const lines: Line[] = [];
    let currentLine: typeof entries = [entries[0]];

    for (let i = 1; i < entries.length; i++) {
      const prev = currentLine[currentLine.length - 1];
      const curr = entries[i];
      if (Math.abs(curr.y - prev.y) < lineThreshold) {
        currentLine.push(curr);
      } else {
        lines.push({
          items: currentLine,
          avgY: currentLine.reduce((s, e) => s + e.y, 0) / currentLine.length,
        });
        currentLine = [curr];
      }
    }
    lines.push({
      items: currentLine,
      avgY: currentLine.reduce((s, e) => s + e.y, 0) / currentLine.length,
    });

    // Sort items within each line by X position
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
    }

    // Group lines into paragraphs by Y gap
    const paragraphs: string[][] = [];
    let currentPara: string[] = [lineToText(lines[0])];

    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].avgY - lines[i].avgY;
      // If gap is larger than ~1.8x line height, it's a new paragraph
      if (gap > avgHeight * 1.8) {
        paragraphs.push(currentPara);
        currentPara = [lineToText(lines[i])];
      } else {
        // Check if lines should merge (same paragraph) or stay separate
        const prevText = currentPara[currentPara.length - 1];
        const currText = lineToText(lines[i]);
        // If previous line ends with CJK char or current starts with CJK, merge without space
        if (prevText && /[\u4e00-\u9fff\u3000-\u303f]$/.test(prevText) ||
            currText && /^[\u4e00-\u9fff\u3000-\u303f]/.test(currText)) {
          currentPara[currentPara.length - 1] = prevText + currText;
        } else {
          currentPara.push(currText);
        }
      }
    }
    paragraphs.push(currentPara);

    // Build HTML
    return paragraphs
      .map(lines => {
        const text = cleanPdfText(lines.join(''));
        return text ? `<p>${escapeHtml(text)}</p>` : '';
      })
      .filter(Boolean)
      .join('');
  }

  function lineToText(line: { items: { str: string; x: number; width: number }[] }): string {
    if (line.items.length === 0) return '';
    let result = line.items[0].str;
    for (let i = 1; i < line.items.length; i++) {
      const prev = line.items[i - 1];
      const curr = line.items[i];
      const gap = curr.x - (prev.x + prev.width);
      // Insert space only for significant gaps (not between CJK chars)
      const prevEndsWithCJK = /[\u4e00-\u9fff\u3000-\u303f]$/.test(prev.str);
      const currStartsWithCJK = /^[\u4e00-\u9fff\u3000-\u303f]/.test(curr.str);
      if (gap > 3 && !prevEndsWithCJK && !currStartsWithCJK) {
        result += ' ';
      }
      result += curr.str;
    }
    return result;
  }

  // ===== Navigation =====

  async function goToChapter(idx: number) {
    if (!book || idx < 0 || idx >= book.chapters.length) return;
    await saveProgressNow();
    currentChapter = idx;
    showChapterNav = false;
    await loadContent();
    if (contentEl) contentEl.scrollTop = 0;

    progressStore.save(book.id, {
      chapterIndex: idx,
      scrollOffset: 0,
      percentage: idx / book.chapters.length,
    });
  }

  function prevChapter() {
    goToChapter(currentChapter - 1);
  }

  function nextChapter() {
    goToChapter(currentChapter + 1);
  }

  // ===== Tap to Define =====

  function handleContentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    // PDF page note button
    const noteBtn = target.closest('[data-add-note]') as HTMLElement | null;
    if (noteBtn) {
      const pageNum = noteBtn.getAttribute('data-add-note');
      if (pageNum) {
        notePopup = { text: `第 ${pageNum} 页`, note: '' };
        selectionToolbar = null;
        return;
      }
    }

    // Check if clicked on an annotation highlight
    if (target.classList.contains('annotation-hl')) {
      const annId = target.getAttribute('data-ann-id');
      if (annId && book) {
        const ann = annotationStore.entries.find(a => a.id === annId);
        if (ann) {
          viewingAnnotation = ann;
          selectionToolbar = null;
          return;
        }
      }
    }

    if (target.tagName === 'A') return;

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    if (selectedText.length > 0) {
      // Show selection toolbar (查字/笔记)
      selectionToolbar = { x: e.clientX, y: e.clientY, text: selectedText };
      dictResult = null;
      notePopup = null;
      viewingAnnotation = null;
      return;
    }

    // Dismiss popups on plain click
    selectionToolbar = null;
    viewingAnnotation = null;

    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!range?.startContainer?.textContent) return;

    const text = range.startContainer.textContent;
    const offset = range.startOffset;
    if (offset >= 0 && offset < text.length) {
      const result = lookup(text, offset);
      if (result.entries.length > 0) {
        dictResult = result;
        dictPos = { x: e.clientX, y: e.clientY };
        showControls = false;
      }
    }
  }

  function handleSelectionDict() {
    if (!selectionToolbar) return;
    const text = selectionToolbar.text;
    const result = lookup(text, 0);
    if (result.entries.length > 0) {
      dictResult = { ...result, query: text };
      dictPos = { x: selectionToolbar.x, y: selectionToolbar.y };
      showControls = false;
    }
    selectionToolbar = null;
  }

  function handleSelectionNote() {
    if (!selectionToolbar) return;
    notePopup = { text: selectionToolbar.text, note: '' };
    selectionToolbar = null;
  }

  function saveAnnotation() {
    if (!notePopup || !book) return;
    const ann: Annotation = {
      id: notePopup.editingId || crypto.randomUUID(),
      bookId: book.id,
      bookTitle: book.title,
      chapterIndex: currentChapter,
      selectedText: notePopup.text,
      note: notePopup.note,
      createdAt: Date.now(),
    };
    if (notePopup.editingId) {
      void annotationStore.remove(notePopup.editingId);
    }
    void annotationStore.add(ann);
    notePopup = null;
  }

  function deleteAnnotation(id: string) {
    void annotationStore.remove(id);
    viewingAnnotation = null;
  }

  async function jumpToAnnotation(ann: Annotation) {
    showAnnotations = false;
    if (currentChapter !== ann.chapterIndex) {
      currentChapter = ann.chapterIndex;
      await loadContent();
    }
  }

  function highlightAnnotations(html: string): string {
    const chapterAnnotations = book ? annotationStore.getByChapter(book.id, currentChapter) : [];
    let result = html;
    for (const ann of chapterAnnotations) {
      const escaped = ann.selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escaped) continue;
      result = result.replace(
        new RegExp(`(?<=[>][^<]*)(${escaped})(?=[^<]*<)`, 'g'),
        `<mark class="annotation-hl" data-ann-id="${ann.id}">$1</mark>`
      );
    }
    return result;
  }

  // ===== Progress & Controls =====

  function handleScroll() {
    if (!book) return;
    if (restoringScroll) return;
    // Throttle with requestAnimationFrame
    if (scrollRaf !== null) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      handleScrollInner();
    });
  }

  function handleScrollInner() {
    if (!book) return;
    if (restoringScroll) return;
    const scrollTop = getReaderScrollTop();
    const { scrollHeight, clientHeight } = getReaderScrollableSize();
    const scrollRatio = getCurrentScrollRatio(scrollTop, scrollHeight, clientHeight);
    if (
      protectedRestoreOffset > 0 &&
      performance.now() < protectRestoreUntil &&
      scrollTop < Math.min(40, protectedRestoreOffset / 4)
    ) {
      void restoreScroll(protectedRestoreOffset, getImmediateSavedProgress(book.id)?.scrollRatio);
      return;
    }
    const pct = scrollTop / (scrollHeight - clientHeight || 1);
    progress = Math.min(1, (currentChapter + pct) / (book.chapters.length || 1));
    updateDebugInfo(scrollTop, scrollHeight, clientHeight);

    saveImmediateProgress(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: progress,
    });

    progressStore.save(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: progress,
    });

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!book) return;
      void progressStore.saveNow(book.id, {
        chapterIndex: currentChapter,
        scrollOffset: scrollTop,
        scrollRatio,
        percentage: progress,
      });
    }, 800);
  }

  function updateDebugInfo(scrollTop = getReaderScrollTop(), scrollHeight?: number, clientHeight?: number) {
    if (!debugReader || !book) return;
    const size = scrollHeight !== undefined && clientHeight !== undefined
      ? { scrollHeight, clientHeight }
      : getReaderScrollableSize();
    const saved = getImmediateSavedProgress(book.id);
    debugInfo = `now=${Math.round(scrollTop)} saved=${Math.round(saved?.scrollOffset || 0)} ratio=${Math.round((saved?.scrollRatio || 0) * 100)}% h=${Math.round(size.scrollHeight)} c=${Math.round(size.clientHeight)} ch=${currentChapter}`;
  }

  function saveProgress() {
    if (!book) return;
    const scrollTop = getReaderScrollTop();
    const { scrollHeight, clientHeight } = getReaderScrollableSize();
    const scrollRatio = getCurrentScrollRatio(scrollTop, scrollHeight, clientHeight);
    progressStore.save(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: progress,
    });
    saveImmediateProgress(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: progress,
    });
  }

  async function saveProgressNow() {
    if (!book) return;
    const scrollTop = getReaderScrollTop();
    const { scrollHeight, clientHeight } = getReaderScrollableSize();
    const scrollRatio = getCurrentScrollRatio(scrollTop, scrollHeight, clientHeight);
    if (
      protectedRestoreOffset > 0 &&
      performance.now() < protectRestoreUntil &&
      scrollTop < Math.min(40, protectedRestoreOffset / 4)
    ) {
      updateDebugInfo(scrollTop, scrollHeight, clientHeight);
      return;
    }
    const pct = scrollTop / (scrollHeight - clientHeight || 1);
    const nextProgress = Math.min(1, (currentChapter + pct) / (book.chapters.length || 1));
    saveImmediateProgress(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: nextProgress,
    });
    await progressStore.saveNow(book.id, {
      chapterIndex: currentChapter,
      scrollOffset: scrollTop,
      scrollRatio,
      percentage: nextProgress,
    });
    updateDebugInfo(scrollTop, scrollHeight, clientHeight);
  }

  function getCurrentScrollRatio(scrollTop = getReaderScrollTop(), scrollHeight?: number, clientHeight?: number) {
    const size = scrollHeight !== undefined && clientHeight !== undefined
      ? { scrollHeight, clientHeight }
      : getReaderScrollableSize();
    return Math.max(0, Math.min(1, scrollTop / Math.max(size.scrollHeight - size.clientHeight, 1)));
  }

  function toggleControls() {
    showControls = !showControls;
    if (showControls) {
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(() => { showControls = false; }, 4000);
    }
  }

  // ===== Bookmarks =====

  function isBookmarked(): boolean {
    if (!book) return false;
    return bookmarkStore.hasAtPosition(book.id, currentChapter) !== undefined;
  }

  function toggleBookmark() {
    if (!book) return;
    const existing = bookmarkStore.hasAtPosition(book.id, currentChapter);
    if (existing) {
      void bookmarkStore.remove(existing.id);
    } else {
      const scrollTop = getReaderScrollTop();
      const { scrollHeight, clientHeight } = getReaderScrollableSize();
      const scrollRatio = getCurrentScrollRatio(scrollTop, scrollHeight, clientHeight);
      const textEl = contentEl;
      const excerpt = textEl?.textContent?.slice(0, 100) || '';
      const bm: Bookmark = {
        id: crypto.randomUUID(),
        bookId: book.id,
        chapterIndex: currentChapter,
        scrollOffset: scrollTop,
        scrollRatio,
        selectedText: excerpt.slice(0, 60),
        note: '',
        createdAt: Date.now(),
      };
      void bookmarkStore.add(bm);
    }
  }

  async function jumpToBookmark(bm: Bookmark) {
    showBookmarks = false;
    if (currentChapter !== bm.chapterIndex) {
      currentChapter = bm.chapterIndex;
      await loadContent();
      void restoreScroll(bm.scrollOffset, bm.scrollRatio);
    } else {
      void restoreScroll(bm.scrollOffset, bm.scrollRatio);
    }
  }

  function deleteBookmark(id: string) {
    void bookmarkStore.remove(id);
  }

  // ===== Theme Toggle =====

  function toggleTheme() {
    const current = settingsStore.settings.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    void settingsStore.update({ theme: next });
  }

  // ===== Edit Book Info =====

  function openEditBook() {
    if (!book) return;
    editTitle = book.title;
    editAuthor = book.author;
    showEditBook = true;
  }

  function saveBookInfo() {
    if (!book) return;
    const title = editTitle.trim();
    const author = editAuthor.trim();
    if (!title) return;
    void bookStore.updateBook(book.id, { title, author });
    book.title = title;
    book.author = author;
    showEditBook = false;
  }

  // ===== Search =====

  function toggleSearch() {
    showSearch = !showSearch;
    if (!showSearch) {
      clearSearch();
    }
  }

  function performSearch() {
    if (!searchQuery.trim()) {
      clearSearch();
      return;
    }
    if (!originalReaderContent) {
      originalReaderContent = readerContent;
    }
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    let count = 0;
    // Split HTML into tags and text segments, only replace in text segments
    const segments = originalReaderContent.split(/(<[^>]+>)/);
    const highlighted = segments.map(segment => {
      if (segment.startsWith('<')) return segment; // skip HTML tags
      return segment.replace(regex, (match) => {
        count++;
        return `<mark class="search-hl">${match}</mark>`;
      });
    }).join('');
    readerContent = highlighted;
    searchMatchCount = count;
    currentMatchIndex = count > 0 ? 1 : 0;
    if (count > 0) {
      scrollToMatch(0);
    }
  }

  function clearSearch() {
    if (originalReaderContent) {
      readerContent = originalReaderContent;
      originalReaderContent = '';
    }
    searchQuery = '';
    searchMatchCount = 0;
    currentMatchIndex = 0;
  }

  function nextMatch() {
    if (searchMatchCount === 0) return;
    currentMatchIndex = currentMatchIndex >= searchMatchCount ? 1 : currentMatchIndex + 1;
    scrollToMatch(currentMatchIndex - 1);
  }

  function prevMatch() {
    if (searchMatchCount === 0) return;
    currentMatchIndex = currentMatchIndex <= 1 ? searchMatchCount : currentMatchIndex - 1;
    scrollToMatch(currentMatchIndex - 1);
  }

  function scrollToMatch(index: number) {
    tick().then(() => {
      const marks = contentEl?.querySelectorAll('mark.search-hl');
      if (!marks || index >= marks.length) return;
      const mark = marks[index] as HTMLElement;
      // Remove previous active
      marks.forEach(m => m.classList.remove('active'));
      mark.classList.add('active');
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ===== Vocab save from DictPopup =====

  function handleSaveVocab(result: LookupResult) {
    if (!book) return;
    const char = result.query;
    if (vocabStore.has(char, book.id)) return;
    const bestEntry = result.entries.find(e => e.definitions.length > 0);
    if (!bestEntry) return;
    void vocabStore.add({
      id: crypto.randomUUID(),
      character: char,
      pinyin: bestEntry.pinyin || '',
      definition: bestEntry.definitions[0],
      bookId: book.id,
      bookTitle: book.title,
      createdAt: Date.now(),
    });
  }

  function goBack() {
    savedOnExit = true;
    void saveProgressNow().finally(() => nav.navigate('bookshelf'));
  }

  // Need db import for epub metadata update
  import { db } from '../lib/db';
</script>

<div class="reader">
  {#if loading}
    <div class="reader-loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>
  {:else if errorMsg}
    <div class="reader-loading">
      <p class="error-text">{errorMsg}</p>
      <button class="retry-btn" onclick={goBack}>返回书架</button>
    </div>
  {:else}
    <!-- Top bar -->
    {#if showControls}
      <header class="reader-top fade-in">
        <button class="back-btn" onclick={goBack} aria-label="返回">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="reader-title">
          <p class="book-name">{book?.title}</p>
          {#if book?.chapters.length}
            <p class="chapter-name">{book.chapters[currentChapter]?.title || `第 ${currentChapter + 1} 章`}</p>
          {/if}
        </div>
        <button class="action-btn edit-book-btn" onclick={openEditBook} aria-label="编辑书名">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <div class="reader-actions">
          <button class="action-btn font-btn" onclick={() => settingsStore.update({ fontSize: Math.max(12, settingsStore.settings.fontSize - 2) })} aria-label="减小字号">A-</button>
          <button class="action-btn font-btn" onclick={() => settingsStore.update({ fontSize: Math.min(32, settingsStore.settings.fontSize + 2) })} aria-label="增大字号">A+</button>
          {#if pdfHasImages}
            <button class="action-btn font-btn" onclick={() => { const step = pdfZoom <= 1.2 ? 0.02 : pdfZoom <= 2 ? 0.1 : 0.2; setPdfZoom(pdfZoom - step); }} aria-label="缩小">−</button>
            <button class="action-btn font-btn" onclick={() => { if (pdfZoom < 1.1) setPdfZoom(1.1); else if (pdfZoom < 1.3) setPdfZoom(1.3); else if (pdfZoom < 1.5) setPdfZoom(1.5); else if (pdfZoom < 2) setPdfZoom(2); else if (pdfZoom < 3) setPdfZoom(3); else resetPdfZoom(); }} aria-label="缩放">{pdfZoom === 1 ? '1x' : `${pdfZoom.toFixed(2)}x`}</button>
            <button class="action-btn font-btn" onclick={() => { const step = pdfZoom < 1.2 ? 0.02 : pdfZoom < 2 ? 0.1 : 0.2; setPdfZoom(pdfZoom + step); }} aria-label="放大">+</button>
          {/if}
          <button class="action-btn" class:active={isBookmarked()} onclick={toggleBookmark} aria-label="书签">
            {#if isBookmarked()}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            {/if}
          </button>
          <button class="action-btn" onclick={toggleTheme} aria-label="主题">
            {#if settingsStore.settings.theme === 'dark'}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            {/if}
          </button>
          <button class="action-btn" onclick={toggleSearch} aria-label="搜索">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button class="action-btn" onclick={() => showChapterNav = !showChapterNav} aria-label="目录">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button class="action-btn" onclick={() => showBookmarks = true} aria-label="书签列表">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
          <button class="action-btn" onclick={() => showAnnotations = true} aria-label="批注列表">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </header>
    {/if}

    <!-- Search bar -->
    {#if showSearch}
      <div class="search-bar fade-in">
        <div class="search-input-wrap">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            class="search-input"
            type="text"
            placeholder="搜索当前章节..."
            bind:value={searchQuery}
            oncompositionstart={() => { isComposing = true; }}
            oncompositionend={() => { isComposing = false; }}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !isComposing) performSearch();
              if (e.key === 'Escape') toggleSearch();
            }}
          />
          <button class="search-go-btn" onclick={performSearch} disabled={!searchQuery.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          {#if searchMatchCount > 0}
            <span class="search-count">{currentMatchIndex}/{searchMatchCount}</span>
          {/if}
        </div>
        <div class="search-nav">
          <button class="search-nav-btn" onclick={prevMatch} disabled={searchMatchCount === 0}>‹</button>
          <button class="search-nav-btn" onclick={nextMatch} disabled={searchMatchCount === 0}>›</button>
          <button class="search-close-btn" onclick={toggleSearch}>✕</button>
        </div>
      </div>
    {/if}

    <!-- Content — unified for all formats including epub -->
    <div class="reader-content">
      <div
        class="text-content"
        class:zoomed={pdfZoom > 1}
        bind:this={contentEl}
        onpointerup={handleContentClick}
        onscroll={handleScroll}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        style="
          font-family: var(--font-{settingsStore.settings.fontFamily});
          font-size: {settingsStore.settings.fontSize}px;
          line-height: {settingsStore.settings.lineHeight};
        "
      >
        {@html highlightAnnotations(readerContent)}
      </div>
    </div>

    <!-- Navigation arrows (all formats) -->
    {#if book?.chapters.length && book.chapters.length > 1}
      <div class="chapter-arrows">
        <button class="arrow-btn" onclick={prevChapter} disabled={currentChapter === 0}>
          ‹ 上一章
        </button>
        <span class="chapter-indicator">{currentChapter + 1} / {book.chapters.length}</span>
        <button class="arrow-btn" onclick={nextChapter} disabled={currentChapter === book.chapters.length - 1}>
          下一章 ›
        </button>
      </div>
    {/if}

    <!-- Progress bar -->
    {#if showControls}
      <div class="progress-bar">
        <div class="progress-fill" style="width: {progress * 100}%"></div>
      </div>
    {/if}

    <!-- Chapter navigation drawer -->
    {#if showChapterNav}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="chapter-overlay" onclick={() => showChapterNav = false} onkeydown={() => {}} role="button" tabindex="-1">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="chapter-drawer slide-up" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
          <div class="drawer-header">
            <h3>目录</h3>
            <button class="drawer-close" onclick={() => showChapterNav = false}>✕</button>
          </div>
          <div class="drawer-list">
            {#each book?.chapters || [] as ch, i}
              <button
                class="drawer-item"
                class:active={i === currentChapter}
                onclick={() => goToChapter(i)}
              >
                <span class="ch-title">{ch.title}</span>
                {#if i === currentChapter}
                  <span class="ch-current">当前</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Dictionary popup -->
    {#if dictResult}
      <DictPopup
        result={dictResult}
        x={dictPos.x}
        y={dictPos.y}
        isSaved={book ? vocabStore.has(dictResult.query, book.id) : false}
        onSave={() => handleSaveVocab(dictResult!)}
        onClose={() => { dictResult = null; showControls = true; }}
      />
    {/if}

    <!-- Bookmark drawer -->
    {#if showBookmarks}
      <BookmarkDrawer
        bookmarks={book ? bookmarkStore.getByBook(book.id) : []}
        onClose={() => showBookmarks = false}
        onJump={jumpToBookmark}
        onDelete={deleteBookmark}
      />
    {/if}

    <!-- Annotation drawer -->
    {#if showAnnotations}
      <AnnotationDrawer
        annotations={book ? annotationStore.getByBook(book.id) : []}
        onClose={() => showAnnotations = false}
        onJump={jumpToAnnotation}
        onDelete={deleteAnnotation}
      />
    {/if}

    <!-- Selection toolbar -->
    {#if selectionToolbar}
      <div class="selection-toolbar" style="left:{Math.max(8, selectionToolbar.x - 60)}px;top:{Math.max(8, selectionToolbar.y - 48)}px;">
        <button class="sel-tool-btn" onclick={handleSelectionDict}>查字</button>
        <button class="sel-tool-btn" onclick={handleSelectionNote}>笔记</button>
      </div>
    {/if}

    <!-- Note input popup -->
    {#if notePopup}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="note-overlay" onclick={() => notePopup = null} onkeydown={(e) => e.key === 'Escape' && (notePopup = null)} role="button" tabindex="-1">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="note-popup fade-in" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
          <div class="note-header">
            <h3>{notePopup.editingId ? '编辑批注' : '添加批注'}</h3>
            <button class="note-close" onclick={() => notePopup = null}>✕</button>
          </div>
          <div class="note-quote">{notePopup.text}</div>
          <textarea
            class="note-input"
            placeholder="写下你的想法..."
            bind:value={notePopup.note}
            rows="3"
            autofocus
          ></textarea>
          <div class="note-actions">
            <button class="note-cancel" onclick={() => notePopup = null}>取消</button>
            <button class="note-save" onclick={saveAnnotation}>保存</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- View annotation popup -->
    {#if viewingAnnotation}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="note-overlay" onclick={() => viewingAnnotation = null} onkeydown={(e) => e.key === 'Escape' && (viewingAnnotation = null)} role="button" tabindex="-1">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="note-popup fade-in" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
          <div class="note-header">
            <h3>批注</h3>
            <button class="note-close" onclick={() => viewingAnnotation = null}>✕</button>
          </div>
          <div class="note-quote">{viewingAnnotation.selectedText}</div>
          <div class="note-view-text">{viewingAnnotation.note}</div>
          <div class="note-actions">
            <button class="note-delete" onclick={() => deleteAnnotation(viewingAnnotation!.id)}>删除</button>
            <button class="note-edit" onclick={() => { notePopup = { text: viewingAnnotation!.selectedText, note: viewingAnnotation!.note, editingId: viewingAnnotation!.id }; viewingAnnotation = null; }}>编辑</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Edit book info popup -->
    {#if showEditBook}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="note-overlay" onclick={() => showEditBook = false} onkeydown={(e) => e.key === 'Escape' && (showEditBook = false)} role="button" tabindex="-1">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="note-popup fade-in" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
          <div class="note-header">
            <h3>编辑书籍信息</h3>
            <button class="note-close" onclick={() => showEditBook = false}>✕</button>
          </div>
          <label class="edit-label">
            书名
            <input class="edit-input" type="text" bind:value={editTitle} placeholder="书名" />
          </label>
          <label class="edit-label">
            作者
            <input class="edit-input" type="text" bind:value={editAuthor} placeholder="作者" />
          </label>
          <div class="note-actions">
            <button class="note-cancel" onclick={() => showEditBook = false}>取消</button>
            <button class="note-save" onclick={saveBookInfo}>保存</button>
          </div>
        </div>
      </div>
    {/if}

    {#if debugReader}
      <div class="reader-debug">{debugInfo}</div>
    {/if}
  {/if}
</div>

<style>
  .reader {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--reader-bg);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .reader-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--text-muted);
  }

  .error-text { color: var(--danger); font-size: 15px; }
  .retry-btn {
    padding: 10px 24px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: white;
    font-size: 14px;
    font-weight: 600;
  }

  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .reader-top {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    padding-top: calc(8px + env(safe-area-inset-top, 0px));
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }

  .back-btn {
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .reader-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .action-btn {
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .action-btn:hover {
    background: var(--bg-secondary);
  }

  .action-btn.active {
    color: var(--accent);
  }

  .font-btn {
    font-size: var(--font-size-body);
    font-weight: 700;
    width: 44px;
  }

  .reader-title { flex: 1; text-align: center; min-width: 0; padding: 0 8px; }
  .book-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chapter-name { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

  .reader-content {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  .text-content {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 16px 20px;
    color: var(--reader-text);
    -webkit-user-select: text;
    user-select: text;
    cursor: text;
  }

  .text-content :global(a) { color: var(--accent); }

  .text-content :global(p) { margin-bottom: 0.8em; text-indent: 2em; }
  .text-content :global(p:empty) { margin-bottom: 0.4em; }
  .text-content :global(h1), .text-content :global(h2), .text-content :global(h3) { text-indent: 0; margin: 1em 0 0.5em; }
  .text-content :global(img) { max-width: 100%; height: auto; display: block; margin: 1em auto; }
  .text-content :global(.pdf-page) { margin-bottom: 2em; padding-bottom: 1em; border-bottom: 1px dashed var(--border); }
  .text-content :global(.pdf-page-num) { text-align: center; color: var(--text-muted); font-size: 12px; margin-bottom: 1em; text-indent: 0; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .text-content :global(.pdf-note-btn) { background: none; border: none; cursor: pointer; padding: 2px 4px; opacity: 0.5; transition: opacity var(--transition-fast), color var(--transition-fast); color: var(--text-muted); display: inline-flex; align-items: center; vertical-align: middle; }
  .text-content :global(.pdf-note-btn:hover) { opacity: 1; color: var(--accent); }
  .text-content :global(.pdf-canvas-page) { width: 100%; height: auto; display: block; border: 1px solid var(--border); border-radius: var(--radius-sm); }

  .text-content.zoomed :global(.pdf-canvas-page) { max-width: none; width: 100%; }
  .text-content :global(.pdf-empty-page) { text-align: center; color: var(--text-muted); font-style: italic; text-indent: 0; }

  .chapter-arrows {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .arrow-btn {
    font-size: 14px;
    color: var(--accent);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    transition: opacity var(--transition-fast);
  }
  .arrow-btn:disabled { opacity: 0.3; pointer-events: none; }
  .chapter-indicator { font-size: 12px; color: var(--text-muted); }

  .progress-bar { height: 3px; background: var(--border); flex-shrink: 0; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; border-radius: 0 2px 2px 0; }

  .chapter-overlay { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,0.3); }
  .chapter-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: 75%; max-width: 320px; background: var(--bg-card); box-shadow: -4px 0 16px var(--shadow); display: flex; flex-direction: column; }
  .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); padding-top: calc(16px + env(safe-area-inset-top, 0px)); }
  .drawer-header h3 { font-size: 17px; font-weight: 600; }
  .drawer-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--text-muted); font-size: 14px; }
  .drawer-list { flex: 1; overflow-y: auto; padding: 8px; }
  .drawer-item { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: left; padding: 12px; border-radius: var(--radius-sm); font-size: 14px; color: var(--text-secondary); transition: background var(--transition-fast); }
  .drawer-item:hover { background: var(--bg-secondary); }
  .drawer-item.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .ch-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch-current { font-size: 11px; color: var(--accent); flex-shrink: 0; margin-left: 8px; }

  .reader-debug {
    position: fixed;
    left: 8px;
    bottom: 8px;
    z-index: 200;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font: 11px/1.4 monospace;
    pointer-events: none;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }

  .search-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: 6px 10px;
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 14px;
    color: var(--text-primary);
    outline: none;
    min-width: 0;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-count {
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .search-nav-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 16px;
    font-weight: 600;
    transition: background var(--transition-fast);
  }

  .search-nav-btn:hover {
    background: var(--bg-secondary);
  }

  .search-nav-btn:disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .search-go-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--accent);
    flex-shrink: 0;
    transition: opacity var(--transition-fast);
  }

  .search-go-btn:disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .search-close-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    font-size: 13px;
    transition: background var(--transition-fast);
  }

  .search-close-btn:hover {
    background: var(--bg-secondary);
  }

  .text-content :global(mark.search-hl) {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }

  .text-content :global(mark.search-hl.active) {
    background: var(--accent);
    color: white;
  }

  .text-content :global(mark.annotation-hl) {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border-bottom: 2px solid color-mix(in srgb, var(--accent) 40%, transparent);
    cursor: pointer;
    padding: 0 1px;
    border-radius: 2px;
  }

  .selection-toolbar {
    position: fixed;
    z-index: 150;
    display: flex;
    gap: 2px;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 16px var(--popup-shadow);
    padding: 4px;
  }

  .sel-tool-btn {
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
  }

  .sel-tool-btn:hover {
    background: var(--bg-secondary);
    color: var(--accent);
  }

  .note-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .note-popup {
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    width: min(400px, 100%);
    box-shadow: 0 12px 40px var(--popup-shadow);
    overflow: hidden;
  }

  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .note-header h3 {
    font-size: 16px;
    font-weight: 600;
  }

  .note-close {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    font-size: 14px;
    transition: background var(--transition-fast);
  }

  .note-close:hover {
    background: var(--bg-secondary);
  }

  .note-quote {
    margin: 12px 16px 0;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: var(--font-serif);
    line-height: 1.6;
    color: var(--text-secondary);
    max-height: 80px;
    overflow-y: auto;
  }

  .note-input {
    display: block;
    width: calc(100% - 32px);
    margin: 12px 16px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    background: var(--bg-primary);
    resize: vertical;
    outline: none;
    font-family: var(--font-ui);
    line-height: 1.5;
  }

  .note-input:focus {
    border-color: var(--accent);
  }

  .note-view-text {
    padding: 12px 16px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .note-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }

  .note-cancel, .note-save, .note-delete, .note-edit {
    padding: 8px 20px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 600;
    transition: background var(--transition-fast);
  }

  .note-cancel {
    color: var(--text-muted);
  }

  .note-cancel:hover {
    background: var(--bg-secondary);
  }

  .note-save, .note-edit {
    background: var(--accent);
    color: white;
  }

  .note-delete {
    color: var(--danger);
  }

  .note-delete:hover {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }

  .edit-book-btn {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .edit-label {
    display: block;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .edit-input {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
  }

  .edit-input:focus {
    border-color: var(--accent);
  }
</style>
