<script lang="ts">
  import { bookStore, nav, progressStore } from '../lib/stores/app.svelte';
  import { formatFileSize } from '../lib/utils/cover';
  import type { Book } from '../lib/types/book';

  // Object URL cache for cover images
  const coverUrlCache = new Map<string, string>();

  function getCoverUrl(blob: Blob, id: string): string {
    let url = coverUrlCache.get(id);
    if (!url) {
      url = URL.createObjectURL(blob);
      coverUrlCache.set(id, url);
    }
    return url;
  }

  let searchQuery = $state('');
  let viewMode = $state<'grid' | 'list'>('grid');
  let showSearch = $state(false);

  let filteredBooks = $derived(
    searchQuery.trim() ? bookStore.search(searchQuery) : bookStore.books
  );

  function openBook(book: Book) {
    nav.navigate('reader', book.id);
  }

  async function deleteBook(e: Event, book: Book) {
    e.stopPropagation();
    if (confirm(`删除「${book.title}」？`)) {
      await bookStore.deleteBook(book.id);
    }
  }

  function getProgress(bookId: string): number {
    return progressStore.get(bookId)?.percentage ?? 0;
  }
</script>

<div class="bookshelf fade-in">
  <header class="top-bar">
    <div class="top-bar-left">
      <div class="logo-icon">章</div>
      <h1 class="title">章章</h1>
    </div>
    <div class="top-bar-right">
      <button class="icon-btn" onclick={() => showSearch = !showSearch} aria-label="搜索">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>
      <button class="icon-btn" onclick={() => viewMode = viewMode === 'grid' ? 'list' : 'grid'} aria-label="切换视图">
        {#if viewMode === 'grid'}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
        {:else}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
        {/if}
      </button>
    </div>
  </header>

  {#if showSearch}
    <div class="search-bar fade-in">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        type="text"
        placeholder="搜索书名或作者..."
        bind:value={searchQuery}
        class="search-input"
      />
      {#if searchQuery}
        <button class="clear-btn" onclick={() => searchQuery = ''}>✕</button>
      {/if}
    </div>
  {/if}

  <div class="page page-padded">
    {#if filteredBooks.length === 0}
      <div class="empty">
        <div class="empty-icon">📖</div>
        {#if searchQuery}
          <p class="empty-text">没有找到匹配的书籍</p>
        {:else}
          <p class="empty-text">书架空空</p>
          <p class="empty-sub">点击底部「+ 导入」添加书籍</p>
        {/if}
      </div>
    {:else if viewMode === 'grid'}
      <div class="book-grid">
        {#each filteredBooks as book (book.id)}
          {@const pct = getProgress(book.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="book-card" onclick={() => openBook(book)} onkeydown={(e) => e.key === 'Enter' && openBook(book)} role="button" tabindex="0">
            <div class="book-cover" style="background: {book.coverGradient}">
              {#if book.coverBlob}
                <img
                  src={getCoverUrl(book.coverBlob, book.id)}
                  alt={book.title}
                  class="cover-img"
                />
              {:else}
                <span class="cover-title">{book.title.slice(0, 2)}</span>
              {/if}
              {#if pct > 0}
                <div class="progress-badge">
                  {Math.round(pct * 100)}%
                </div>
              {/if}
            </div>
            <div class="book-info">
              <p class="book-title">{book.title}</p>
              <p class="book-author">{book.author}</p>
            </div>
            <button class="delete-btn" onclick={(e) => deleteBook(e, book)} title="删除">✕</button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="book-list">
        {#each filteredBooks as book (book.id)}
          {@const pct = getProgress(book.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="book-row" onclick={() => openBook(book)} onkeydown={(e) => e.key === 'Enter' && openBook(book)} role="button" tabindex="0">
            <div class="row-cover" style="background: {book.coverGradient}">
              {#if book.coverBlob}
                <img src={getCoverUrl(book.coverBlob, book.id)} alt="" class="cover-img" />
              {:else}
                <span class="cover-title-sm">{book.title.slice(0, 1)}</span>
              {/if}
            </div>
            <div class="row-info">
              <p class="row-title">{book.title}</p>
              <p class="row-meta">{book.author} · {formatFileSize(book.fileSize)} · {book.format.toUpperCase()}</p>
            </div>
            {#if pct > 0}
              <span class="row-progress">{Math.round(pct * 100)}%</span>
            {/if}
            <button class="delete-btn-row" onclick={(e) => deleteBook(e, book)}>✕</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .bookshelf {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--space-md);
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    flex-shrink: 0;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-serif);
    font-weight: 700;
    font-size: 18px;
  }

  .title {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  .top-bar-right {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    transition: background var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--bg-secondary);
  }

  .search-bar {
    display: flex;
    align-items: center;
    margin: 0 var(--space-md) var(--space-sm);
    padding: 0 var(--space-md);
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    height: 44px;
    gap: 8px;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: none;
    outline: none;
    color: var(--text-primary);
    font-size: 15px;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .clear-btn {
    color: var(--text-muted);
    font-size: var(--font-size-body);
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Grid View */
  .book-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: var(--space-md);
  }

  .book-card {
    position: relative;
    display: flex;
    flex-direction: column;
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .book-cover {
    aspect-ratio: 3/4;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.08);
    transition: transform var(--transition-normal), box-shadow var(--transition-normal);
  }

  .book-card:hover .book-cover {
    transform: translateY(-4px) scale(1.01);
    box-shadow: var(--shadow-elevated);
  }

  .book-card:active .book-cover {
    transform: scale(0.97);
    box-shadow: 0 1px 4px var(--shadow);
  }

  .cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-title {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    text-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .cover-title-sm {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
  }

  .progress-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0,0,0,0.6);
    color: white;
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: 10px;
    backdrop-filter: blur(4px);
  }

  .book-info {
    padding: 8px 2px 0;
  }

  .book-title {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .book-author {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 2px;
    display: -webkit-box;
    line-clamp: 1;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .delete-btn {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0,0,0,0.5);
    color: white;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .book-card:hover .delete-btn,
  .book-card:active .delete-btn {
    opacity: 1;
  }

  /* List View */
  .book-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .book-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
    text-align: left;
    -webkit-tap-highlight-color: transparent;
  }

  .book-row:hover {
    background: var(--bg-secondary);
  }

  .row-cover {
    width: 48px;
    height: 64px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .row-info {
    flex: 1;
    min-width: 0;
  }

  .row-title {
    font-size: 15px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-meta {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin-top: 4px;
  }

  .row-progress {
    font-size: var(--font-size-sm);
    color: var(--accent);
    font-weight: 600;
    flex-shrink: 0;
  }

  .delete-btn-row {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    font-size: 14px;
    transition: color var(--transition-fast);
  }

  .delete-btn-row:hover {
    color: var(--danger);
  }

  /* Empty State */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl) 0;
    text-align: center;
  }

  .empty-icon {
    font-size: 64px;
    margin-bottom: var(--space-md);
    opacity: 0.6;
    animation: float 3s ease-in-out infinite;
  }

  .empty-text {
    font-size: 16px;
    color: var(--text-secondary);
  }

  .empty-sub {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 8px;
  }
</style>
