<script lang="ts">
  import type { Annotation } from '../../lib/types/annotation';

  interface Props {
    annotations: Annotation[];
    onClose: () => void;
    onJump: (annotation: Annotation) => void;
    onDelete: (id: string) => void;
  }

  let { annotations, onClose, onJump, onDelete }: Props = $props();

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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer slide-in-right" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
    <div class="drawer-header">
      <h2>批注</h2>
      <span class="drawer-count">{annotations.length}</span>
      <button class="drawer-close" onclick={onClose}>✕</button>
    </div>

    <div class="drawer-body">
      {#if annotations.length === 0}
        <div class="drawer-empty">
          <p>还没有批注</p>
          <p class="empty-hint">选中文字后点击"笔记"添加</p>
        </div>
      {:else}
        {#each annotations as ann (ann.id)}
          <div class="annotation-item">
            <button class="annotation-content" onclick={() => onJump(ann)}>
              <div class="annotation-quote">{ann.selectedText}</div>
              <div class="annotation-note">{ann.note}</div>
              <div class="annotation-meta">第 {ann.chapterIndex + 1} 章 · {formatTime(ann.createdAt)}</div>
            </button>
            <button class="annotation-delete" onclick={() => onDelete(ann.id)} aria-label="删除批注">
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
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-secondary);
    padding: 1px 8px;
    border-radius: 10px;
  }

  .drawer-close {
    margin-left: auto;
    width: 28px;
    height: 28px;
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
    font-size: 13px;
    margin-top: 4px;
  }

  .annotation-item {
    display: flex;
    align-items: flex-start;
    border-bottom: 1px solid var(--border);
  }

  .annotation-content {
    flex: 1;
    text-align: left;
    padding: 12px 16px;
    min-width: 0;
  }

  .annotation-quote {
    font-size: 13px;
    color: var(--text-secondary);
    font-family: var(--font-serif);
    line-height: 1.5;
    padding-left: 8px;
    border-left: 3px solid var(--accent);
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .annotation-note {
    font-size: 14px;
    color: var(--text-primary);
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .annotation-meta {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .annotation-delete {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    flex-shrink: 0;
    margin-top: 8px;
    margin-right: 8px;
    transition: background var(--transition-fast);
  }

  .annotation-delete:hover {
    background: var(--bg-secondary);
    color: #E74C3C;
  }

  .annotation-delete svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .slide-in-right {
    animation: slideInRight 0.25s ease-out;
  }

  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
</style>
