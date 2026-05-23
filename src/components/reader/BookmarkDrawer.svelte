<script lang="ts">
  import type { Bookmark } from '../../lib/types/bookmark';

  interface Props {
    bookmarks: Bookmark[];
    onClose: () => void;
    onJump: (bookmark: Bookmark) => void;
    onDelete: (id: string) => void;
  }

  let { bookmarks, onClose, onJump, onDelete }: Props = $props();

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer slide-in-right" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
    <div class="drawer-header">
      <h2>书签</h2>
      <span class="drawer-count">{bookmarks.length}</span>
      <button class="drawer-close" onclick={onClose}>✕</button>
    </div>

    <div class="drawer-body">
      {#if bookmarks.length === 0}
        <div class="drawer-empty">
          <p>还没有书签</p>
          <p class="empty-hint">点击顶部书签图标添加</p>
        </div>
      {:else}
        {#each bookmarks as bm (bm.id)}
          <div class="bookmark-item">
            <button class="bookmark-content" onclick={() => onJump(bm)}>
              <div class="bookmark-chapter">第 {bm.chapterIndex + 1} 章</div>
              <div class="bookmark-text">{bm.selectedText}</div>
              <div class="bookmark-time">{formatTime(bm.createdAt)}</div>
            </button>
            <button class="bookmark-delete" onclick={() => onDelete(bm.id)} aria-label="删除书签">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.3);
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 85vw);
    background: var(--bg-card);
    z-index: 201;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px var(--popup-shadow);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .drawer-header h2 {
    font-size: 17px;
    font-weight: 600;
    font-family: var(--font-serif);
  }

  .drawer-count {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 1px 8px;
    border-radius: 10px;
  }

  .drawer-close {
    margin-left: auto;
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

  .drawer-close:hover {
    background: var(--bg-secondary);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .drawer-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-hint {
    font-size: var(--font-size-body);
    margin-top: 4px;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
  }

  .bookmark-content {
    flex: 1;
    text-align: left;
    padding: 12px 16px;
    min-width: 0;
  }

  .bookmark-chapter {
    font-size: var(--font-size-sm);
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 4px;
  }

  .bookmark-text {
    font-size: var(--font-size-body);
    color: var(--text-primary);
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-family: var(--font-serif);
  }

  .bookmark-time {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-top: 4px;
  }

  .bookmark-delete {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    flex-shrink: 0;
    margin-right: 8px;
    transition: background var(--transition-fast);
  }

  .bookmark-delete:hover {
    background: var(--bg-secondary);
    color: var(--danger);
  }

  .bookmark-delete svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

</style>
