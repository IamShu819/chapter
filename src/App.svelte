<script lang="ts">
  import { onMount } from 'svelte';
  import { nav, bookStore, progressStore, settingsStore, bookmarkStore, vocabStore, annotationStore } from './lib/stores/app.svelte';
  import BottomTabs from './components/nav/BottomTabs.svelte';
  import Bookshelf from './routes/Bookshelf.svelte';
  import Vocab from './routes/Vocab.svelte';
  import Import from './routes/Import.svelte';
  import Settings from './routes/Settings.svelte';
  import Reader from './routes/Reader.svelte';

  let ready = $state(false);

  // Reactively apply theme to <html> element
  $effect(() => {
    const theme = settingsStore.settings.theme;
    document.documentElement.setAttribute('data-theme', theme);
    const colors: Record<string, string> = { light: '#2D6A4F', dark: '#121212', sepia: '#F5E6D3' };
    const bg = colors[theme] || colors['light'];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
  });

  onMount(async () => {
    // Update Capacitor StatusBar on Android
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      const colors: Record<string, string> = { light: '#2D6A4F', dark: '#121212', sepia: '#F5E6D3' };
      const bg = colors[settingsStore.settings.theme] || colors['light'];
      await StatusBar.setBackgroundColor({ color: bg });
      await StatusBar.setStyle({ style: settingsStore.settings.theme === 'dark' ? 'dark' : 'light' });
    } catch {}

    await Promise.all([
      bookStore.loadAll(),
      progressStore.loadAll(),
      settingsStore.load(),
      bookmarkStore.loadAll(),
      vocabStore.loadAll(),
      annotationStore.loadAll(),
    ]);
    ready = true;
  });
</script>

{#if ready}
  {#if nav.currentPage === 'reader'}
    <Reader />
  {:else}
    <div class="app-shell" data-theme={settingsStore.settings.theme}>
      {#if nav.currentPage === 'bookshelf'}
        <Bookshelf />
      {:else if nav.currentPage === 'vocab'}
        <Vocab />
      {:else if nav.currentPage === 'import'}
        <Import />
      {:else if nav.currentPage === 'settings'}
        <Settings />
      {/if}
      <BottomTabs />
    </div>
  {/if}
{:else}
  <div class="splash">
    <div class="splash-icon">章</div>
    <div class="splash-name">章章</div>
    <div class="splash-sub">Chapter</div>
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }

  .splash-icon {
    width: 80px;
    height: 80px;
    border-radius: 20px;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    font-family: var(--font-serif);
    font-weight: 700;
  }

  .splash-name {
    font-size: 24px;
    font-weight: 600;
    margin-top: 12px;
  }

  .splash-sub {
    font-size: 14px;
    color: var(--text-muted);
    letter-spacing: 2px;
  }
</style>
