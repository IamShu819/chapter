<script lang="ts">
  import type { LookupResult } from '../../lib/types/dictionary';

  interface Props {
    result: LookupResult;
    x: number;
    y: number;
    isSaved: boolean;
    onSave: () => void;
    onClose: () => void;
  }

  let { result, x, y, isSaved, onSave, onClose }: Props = $props();

  let showExamples = $state(false);

  // Position popup to stay in viewport
  let popupStyle = $derived(() => {
    const popupWidth = Math.min(320, window.innerWidth - 32);
    const popupHeight = 280;
    let left = x - popupWidth / 2;
    let top = y - popupHeight - 20;

    left = Math.max(16, Math.min(left, window.innerWidth - popupWidth - 16));
    if (top < 16) top = y + 20;
    if (top + popupHeight > window.innerHeight - 100) {
      top = window.innerHeight - popupHeight - 100;
    }

    return `left:${left}px;top:${top}px;width:${popupWidth}px;`;
  });

  function formatPinyin(raw: string): string {
    return raw.replace(/(\d)/g, (m) => {
      const tones: Record<string, string> = {
        '1': 'ˉ', '2': 'ˊ', '3': 'ˇ', '4': 'ˋ', '5': '',
      };
      return tones[m] || m;
    });
  }

  function toneColor(pinyin: string): string {
    if (pinyin.includes('ā') || pinyin.includes('ē') || pinyin.includes('ī') || pinyin.includes('ō') || pinyin.includes('ū') || pinyin.includes('ǖ') || pinyin.includes('ˉ')) return '#E74C3C';
    if (pinyin.includes('á') || pinyin.includes('é') || pinyin.includes('í') || pinyin.includes('ó') || pinyin.includes('ú') || pinyin.includes('ǘ') || pinyin.includes('ˊ')) return '#F39C12';
    if (pinyin.includes('ǎ') || pinyin.includes('ě') || pinyin.includes('ǐ') || pinyin.includes('ǒ') || pinyin.includes('ǔ') || pinyin.includes('ǚ') || pinyin.includes('ˇ')) return '#27AE60';
    if (pinyin.includes('à') || pinyin.includes('è') || pinyin.includes('ì') || pinyin.includes('ò') || pinyin.includes('ù') || pinyin.includes('ǜ') || pinyin.includes('ˋ')) return '#2980B9';
    return 'var(--text-secondary)';
  }

  function formatClassicalDef(def: string): string {
    // Highlight source citations 《xxx》
    return def.replace(/《([^》]+)》/g, '<span class="dict-source">《$1》</span>');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dict-overlay" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dict-popup slide-up" style={popupStyle()} onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="dialog" tabindex="-1">
    <div class="dict-header">
      <span class="dict-char">{result.query}</span>
      {#if result.entries.length > 0 && result.entries[0].pinyin}
        <span class="dict-pinyin" style="color: {toneColor(result.entries[0].pinyin)}">
          {formatPinyin(result.entries[0].pinyin)}
        </span>
      {/if}
      <button class="dict-save" class:saved={isSaved} onclick={onSave} aria-label="收藏">
        {#if isSaved}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        {/if}
      </button>
      <button class="dict-close" onclick={onClose}>✕</button>
    </div>

    <div class="dict-body">
      {#if result.entries.length === 0}
        <p class="dict-empty">未找到释义</p>
      {:else}
        {#each result.entries as entry, i}
          {#if entry.definitions.length > 0}
            <div class="dict-entry" class:classical={entry.isClassical}>
              {#if entry.isClassical}
                <span class="dict-badge">古文</span>
              {/if}
              {#each entry.definitions as def, j}
                <p class="dict-def" class:has-internal-num={def.startsWith('①') || def.startsWith('②') || def.startsWith('③')}>
                  {#if entry.isClassical}
                    {@html formatClassicalDef(def)}
                  {:else}
                    <span class="def-num">{entry.definitions.length > 1 ? `${j + 1}.` : ''}</span>
                    {def}
                  {/if}
                </p>
              {/each}
            </div>
          {/if}
        {/each}

        {@const examples = result.entries.flatMap(e => e.examples || [])}
        {#if examples.length > 0}
          <button class="examples-toggle" onclick={() => showExamples = !showExamples}>
            {showExamples ? '收起例句' : `查看 ${examples.length} 条例句`}
            <span class="toggle-arrow" class:open={showExamples}>▾</span>
          </button>
          {#if showExamples}
            <div class="examples">
              {#each examples.slice(0, 5) as ex}
                <div class="example">
                  <p class="example-zh">{ex.chinese}</p>
                  <p class="example-tr">{ex.translation}</p>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .dict-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.2);
  }

  .dict-popup {
    position: fixed;
    z-index: 101;
    background: var(--popup-bg);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px var(--popup-shadow);
    overflow: hidden;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
  }

  .dict-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .dict-char {
    font-family: var(--font-serif);
    font-size: 24px;
    font-weight: 700;
    color: var(--accent);
  }

  .dict-pinyin {
    font-size: 16px;
    font-weight: 500;
  }

  .dict-save {
    margin-left: auto;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--text-muted);
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .dict-save:hover {
    background: var(--bg-secondary);
    color: #E74C3C;
  }

  .dict-save.saved {
    color: #E74C3C;
  }

  .dict-close {
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

  .dict-close:hover {
    background: var(--bg-secondary);
  }

  .dict-body {
    padding: 12px 16px;
    overflow-y: auto;
  }

  .dict-empty {
    color: var(--text-muted);
    font-size: 14px;
    text-align: center;
    padding: 16px;
  }

  .dict-entry {
    margin-bottom: 10px;
  }

  .dict-entry.classical {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    margin-left: -10px;
    margin-right: -10px;
  }

  .dict-badge {
    display: inline-block;
    font-size: 11px;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    padding: 1px 6px;
    border-radius: 8px;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .dict-def {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
  }

  .def-num {
    color: var(--text-muted);
    margin-right: 4px;
  }

  .dict-def.has-internal-num {
    padding-left: 0;
  }

  :global(.dict-source) {
    color: var(--accent);
    font-weight: 500;
    font-size: 13px;
  }

  .examples-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--accent);
    padding: 6px 0;
    width: 100%;
    text-align: left;
  }

  .toggle-arrow {
    font-size: 12px;
    transition: transform var(--transition-fast);
  }

  .toggle-arrow.open {
    transform: rotate(180deg);
  }

  .examples {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .example {
    padding: 6px 0;
  }

  .example-zh {
    font-size: 14px;
    font-family: var(--font-serif);
    line-height: 1.5;
  }

  .example-tr {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
</style>
