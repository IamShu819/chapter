<script lang="ts">
  import type { VocabEntry } from '../lib/types/vocabulary';
  import { vocabStore } from '../lib/stores/app.svelte';

  let entries = $derived(vocabStore.entries);

  // Review state
  let reviewMode = $state(false);
  let reviewCards = $state<VocabEntry[]>([]);
  let currentIndex = $state(0);
  let flipped = $state(false);
  let reviewDone = $state(false);
  let knownCount = $state(0);
  let unknownCount = $state(0);
  let retryMap = new Map<string, number>();
  const MAX_RETRIES = 2;

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  async function handleDelete(id: string) {
    await vocabStore.remove(id);
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startReview() {
    if (entries.length === 0) return;
    reviewCards = shuffle(entries);
    currentIndex = 0;
    flipped = false;
    reviewDone = false;
    knownCount = 0;
    unknownCount = 0;
    retryMap = new Map();
    reviewMode = true;
  }

  function answerKnown() {
    knownCount++;
    nextCard();
  }

  function answerUnknown() {
    unknownCount++;
    // Push to end of queue for retry, with a max retry limit
    if (currentIndex < reviewCards.length) {
      const card = reviewCards[currentIndex];
      const retries = retryMap.get(card.id) ?? 0;
      if (retries < MAX_RETRIES) {
        retryMap.set(card.id, retries + 1);
        reviewCards = [...reviewCards, card];
      }
    }
    nextCard();
  }

  function nextCard() {
    flipped = false;
    currentIndex++;
    if (currentIndex >= reviewCards.length) {
      reviewDone = true;
    }
  }

  function exitReview() {
    reviewMode = false;
    reviewDone = false;
  }

  let currentCard = $derived(reviewMode && !reviewDone ? reviewCards[currentIndex] : null);
</script>

{#if reviewMode}
  <div class="review-page">
    <header class="review-header">
      <button class="review-back" onclick={exitReview} aria-label="返回">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span class="review-progress">{currentIndex + (reviewDone ? 0 : 1)} / {reviewCards.length}</span>
      <span class="review-stats">
        <svg class="stat-icon known-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{knownCount}
        <svg class="stat-icon unknown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>{unknownCount}
      </span>
    </header>

    {#if reviewDone}
      <div class="review-result">
        <div class="result-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <h2>复习完成</h2>
        <div class="result-stats">
          <div class="stat known">
            <span class="stat-num">{knownCount}</span>
            <span class="stat-label">认识</span>
          </div>
          <div class="stat unknown">
            <span class="stat-num">{unknownCount}</span>
            <span class="stat-label">不认识</span>
          </div>
          <div class="stat total">
            <span class="stat-num">{knownCount + unknownCount}</span>
            <span class="stat-label">总计</span>
          </div>
        </div>
        <button class="review-done-btn" onclick={exitReview}>返回生词本</button>
      </div>
    {:else if currentCard}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="card-area" onclick={() => flipped = !flipped} onkeydown={() => {}} role="button" tabindex="-1">
        <div class="flashcard" class:flipped>
          <div class="card-front">
            <span class="card-char">{currentCard.character}</span>
            <span class="card-hint">点击翻转</span>
          </div>
          <div class="card-back">
            <span class="card-char small">{currentCard.character}</span>
            <span class="card-pinyin">{currentCard.pinyin}</span>
            <span class="card-def">{currentCard.definition}</span>
          </div>
        </div>
      </div>

      {#if flipped}
        <div class="review-actions fade-in">
          <button class="review-btn unknown" onclick={answerUnknown}>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            不认识
          </button>
          <button class="review-btn known" onclick={answerKnown}>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            认识
          </button>
        </div>
      {/if}
    {/if}
  </div>
{:else}
  <div class="vocab-page">
    <header class="vocab-header">
      <h1>生词本</h1>
      <span class="vocab-count">{entries.length} 个生词</span>
      {#if entries.length > 0}
        <button class="review-start-btn" onclick={startReview}>复习</button>
      {/if}
    </header>

    <div class="vocab-list">
      {#if entries.length === 0}
        <div class="vocab-empty">
          <div class="empty-icon">📖</div>
          <p>还没有收藏生词</p>
          <p class="empty-hint">阅读时查字，点击心形收藏</p>
        </div>
      {:else}
        {#each entries as entry (entry.id)}
          <div class="vocab-item">
            <div class="vocab-main">
              <span class="vocab-char">{entry.character}</span>
              <div class="vocab-info">
                <span class="vocab-pinyin">{entry.pinyin}</span>
                <span class="vocab-def">{entry.definition}</span>
                <span class="vocab-meta">
                  {entry.bookTitle} · {formatTime(entry.createdAt)}
                </span>
              </div>
            </div>
            <button class="vocab-delete" onclick={() => handleDelete(entry.id)} aria-label="删除">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ===== List mode ===== */
  .vocab-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .vocab-header {
    padding: var(--space-md) 20px var(--space-sm-md);
    padding-top: calc(var(--space-md) + env(safe-area-inset-top, 0px));
    display: flex;
    align-items: baseline;
    gap: var(--space-sm-md);
    flex-shrink: 0;
  }

  .vocab-header h1 {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  .vocab-count {
    font-size: var(--font-size-body);
    color: var(--text-muted);
  }

  .review-start-btn {
    margin-left: auto;
    padding: 6px var(--space-md);
    border-radius: var(--radius-md);
    background: var(--accent);
    color: white;
    font-size: var(--font-size-body);
    font-weight: 600;
  }

  .vocab-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-md) var(--space-md);
  }

  .vocab-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-icon {
    font-size: 40px;
    margin-bottom: 12px;
    animation: float 3s ease-in-out infinite;
  }

  .empty-hint {
    font-size: var(--font-size-body);
    margin-top: 4px;
  }

  .vocab-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm-md);
    padding: var(--space-sm-md) 0;
    border-bottom: 1px solid var(--border);
  }

  .vocab-main {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm-md);
    flex: 1;
    min-width: 0;
  }

  .vocab-char {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
    width: 40px;
    text-align: center;
    line-height: 1.2;
  }

  .vocab-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .vocab-pinyin {
    font-size: var(--font-size-body);
    color: var(--text-secondary);
  }

  .vocab-def {
    font-size: var(--font-size-body);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vocab-meta {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  .vocab-delete {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    flex-shrink: 0;
    transition: background var(--transition-fast);
  }

  .vocab-delete:hover {
    background: var(--bg-secondary);
    color: var(--danger);
  }

  .vocab-delete svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  /* ===== Review mode ===== */
  .review-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--bg-primary);
  }

  .review-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm-md);
    padding: var(--space-sm-md) var(--space-md);
    padding-top: calc(var(--space-sm-md) + env(safe-area-inset-top, 0px));
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .review-back {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }

  .review-progress {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .review-stats {
    margin-left: auto;
    font-size: var(--font-size-body);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .stat-icon {
    width: 14px;
    height: 14px;
  }

  .known-icon { color: var(--success); }
  .unknown-icon { color: var(--danger); }

  .card-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    perspective: 1000px;
  }

  .flashcard {
    width: 100%;
    max-width: 320px;
    aspect-ratio: 3 / 4;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 0.5s ease;
  }

  .flashcard.flipped {
    transform: rotateY(180deg);
  }

  .card-front, .card-back {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    border-radius: var(--radius-xl);
    box-shadow: 0 4px 24px var(--shadow);
    padding: 24px;
  }

  .card-front {
    background: var(--bg-card);
  }

  .card-back {
    background: var(--bg-card);
    transform: rotateY(180deg);
  }

  .card-char {
    font-family: var(--font-serif);
    font-size: 72px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
  }

  .card-char.small {
    font-size: 36px;
  }

  .card-hint {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
  }

  .card-pinyin {
    font-size: 18px;
    color: var(--text-secondary);
  }

  .card-def {
    font-size: 16px;
    color: var(--text-primary);
    text-align: center;
    line-height: 1.6;
  }

  .review-actions {
    display: flex;
    gap: var(--space-sm-md);
    padding: var(--space-md) var(--space-lg);
    padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom, 0px));
    flex-shrink: 0;
  }

  .review-btn {
    flex: 1;
    padding: 14px;
    border-radius: var(--radius-md);
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform var(--transition-fast);
  }

  .review-btn:active {
    transform: scale(0.96);
  }

  .review-btn.unknown {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }

  .review-btn.known {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success);
  }

  .btn-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  /* Result screen */
  .review-result {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 24px;
  }

  .result-icon {
    width: 56px;
    height: 56px;
    color: var(--accent);
  }

  .result-icon svg {
    width: 100%;
    height: 100%;
  }

  .review-result h2 {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  .result-stats {
    display: flex;
    gap: 24px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-num {
    font-size: 28px;
    font-weight: 700;
  }

  .stat.known .stat-num { color: var(--success); }
  .stat.unknown .stat-num { color: var(--danger); }
  .stat.total .stat-num { color: var(--text-primary); }

  .stat-label {
    font-size: var(--font-size-body);
    color: var(--text-muted);
  }

  .review-done-btn {
    margin-top: 12px;
    padding: 12px 32px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: white;
    font-size: 15px;
    font-weight: 600;
  }

</style>
