<script lang="ts">
  import { nav } from '../../lib/stores/app.svelte';

  const tabs = [
    { id: 'bookshelf' as const, icon: 'books', label: '书架' },
    { id: 'vocab' as const, icon: 'vocab', label: '生词' },
    { id: 'import' as const, icon: 'plus', label: '导入' },
    { id: 'settings' as const, icon: 'settings', label: '设置' },
  ];
</script>

<nav class="bottom-tabs">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={nav.currentPage === tab.id}
      onclick={() => nav.navigate(tab.id)}
      aria-label={tab.label}
    >
      <span class="tab-icon">
        {#if tab.icon === 'books'}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>
        {:else if tab.icon === 'plus'}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        {:else if tab.icon === 'vocab'}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true" overflow="visible"><circle cx="12" cy="12" r="3.5"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06A1.8 1.8 0 0 0 8.45 19.3a1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.86 15a1.8 1.8 0 0 0-1.65-1.08H2a2.1 2.1 0 0 1 0-4.2h.06a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.08-1.65V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15z"/></svg>
        {/if}
      </span>
      <span class="tab-label">{tab.label}</span>
    </button>
  {/each}
</nav>

<style>
  .bottom-tabs {
    display: flex;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-card) 85%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 -1px 8px rgba(0,0,0,0.06);
    padding-bottom: var(--safe-bottom);
    flex-shrink: 0;
    transition: background var(--transition-normal);
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 10px 0 14px;
    color: var(--text-muted);
    transition: color var(--transition-fast), background var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
    position: relative;
    border-radius: var(--radius-sm);
  }

  .tab:not(.active):hover {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  .tab.active {
    color: var(--accent);
  }

  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
  }

  .tab-icon {
    width: 20px;
    height: 20px;
    display: flex;
  }

  .tab-icon svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-label {
    font-size: 10px;
    font-weight: 500;
  }
</style>
