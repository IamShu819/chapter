<script lang="ts">
  import { settingsStore } from '../lib/stores/app.svelte';
  import type { ReaderSettings } from '../lib/types/reader';

  function setTheme(theme: ReaderSettings['theme']) {
    settingsStore.update({ theme });
  }

  function setFontFamily(fontFamily: ReaderSettings['fontFamily']) {
    settingsStore.update({ fontFamily });
  }

  function setFontSize(e: Event) {
    settingsStore.update({ fontSize: Number((e.target as HTMLInputElement).value) });
  }

  function setLineHeight(e: Event) {
    settingsStore.update({ lineHeight: Number((e.target as HTMLInputElement).value) });
  }
</script>

<div class="settings-page fade-in">
  <header class="page-header">
    <h1 class="page-title">设置</h1>
  </header>

  <div class="page page-padded">
    <section class="section">
      <h3 class="section-title">外观</h3>

      <div class="setting-row">
        <span class="setting-label">主题</span>
        <div class="theme-options">
          <button
            class="theme-btn"
            class:active={settingsStore.settings.theme === 'light'}
            onclick={() => setTheme('light')}
          >
            <span class="theme-preview light-preview"></span>
            <span>浅色</span>
          </button>
          <button
            class="theme-btn"
            class:active={settingsStore.settings.theme === 'dark'}
            onclick={() => setTheme('dark')}
          >
            <span class="theme-preview dark-preview"></span>
            <span>深色</span>
          </button>
          <button
            class="theme-btn"
            class:active={settingsStore.settings.theme === 'sepia'}
            onclick={() => setTheme('sepia')}
          >
            <span class="theme-preview sepia-preview"></span>
            <span>棕褐</span>
          </button>
        </div>
      </div>

      <div class="setting-row">
        <span class="setting-label">字体</span>
        <div class="font-options">
          <button
            class="font-btn"
            class:active={settingsStore.settings.fontFamily === 'serif'}
            onclick={() => setFontFamily('serif')}
          >
            宋体
          </button>
          <button
            class="font-btn"
            class:active={settingsStore.settings.fontFamily === 'sans'}
            onclick={() => setFontFamily('sans')}
          >
            黑体
          </button>
          <button
            class="font-btn"
            class:active={settingsStore.settings.fontFamily === 'mono'}
            onclick={() => setFontFamily('mono')}
          >
            等宽
          </button>
        </div>
      </div>

      <div class="setting-row slider-row">
        <div class="slider-header">
          <span class="setting-label">字号</span>
          <span class="slider-value">{settingsStore.settings.fontSize}px</span>
        </div>
        <input
          type="range"
          min="12"
          max="32"
          step="1"
          value={settingsStore.settings.fontSize}
          oninput={setFontSize}
          class="slider"
        />
      </div>

      <div class="setting-row slider-row">
        <div class="slider-header">
          <span class="setting-label">行距</span>
          <span class="slider-value">{settingsStore.settings.lineHeight.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="1.2"
          max="3"
          step="0.1"
          value={settingsStore.settings.lineHeight}
          oninput={setLineHeight}
          class="slider"
        />
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">阅读</h3>
      <div class="setting-row">
        <span class="setting-label">翻页动画</span>
        <div class="font-options">
          <button
            class="font-btn"
            class:active={settingsStore.settings.turnPageAnimation === 'slide'}
            onclick={() => settingsStore.update({ turnPageAnimation: 'slide' })}
          >
            滑动
          </button>
          <button
            class="font-btn"
            class:active={settingsStore.settings.turnPageAnimation === 'fade'}
            onclick={() => settingsStore.update({ turnPageAnimation: 'fade' })}
          >
            淡入
          </button>
          <button
            class="font-btn"
            class:active={settingsStore.settings.turnPageAnimation === 'none'}
            onclick={() => settingsStore.update({ turnPageAnimation: 'none' })}
          >
            无
          </button>
        </div>
      </div>
    </section>

    <section class="section">
      <h3 class="section-title">预览</h3>
      <div
        class="preview-box"
        style="
          background: var(--reader-bg);
          color: var(--reader-text);
          font-family: var(--font-{settingsStore.settings.fontFamily});
          font-size: {settingsStore.settings.fontSize}px;
          line-height: {settingsStore.settings.lineHeight};
        "
      >
        <p>豫章故郡，洪都新府。星分翼轸，地接衡庐。襟三江而带五湖，控蛮荆而引瓯越。</p>
        <p style="margin-top: 0.5em">—— 王勃《滕王阁序》</p>
      </div>
    </section>

    <section class="section about">
      <p class="app-name">章章 Chapter</p>
      <p class="app-version">v1.0.0</p>
      <p class="app-desc">轻量古文与多格式阅读器</p>
    </section>
  </div>
</div>

<style>
  .settings-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .page-header {
    padding: 16px var(--space-md);
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    flex-shrink: 0;
  }

  .page-title {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  .section {
    margin-bottom: var(--space-lg);
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-sm);
  }

  .setting-row {
    padding: var(--space-sm) 0;
  }

  .setting-label {
    font-size: 15px;
    font-weight: 500;
  }

  .theme-options {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .theme-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-secondary);
    border: 2px solid transparent;
    transition: all var(--transition-fast);
  }

  .theme-btn.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .theme-preview {
    width: 48px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .light-preview { background: #FDF6E3; }
  .dark-preview { background: #1A1A1A; }
  .sepia-preview { background: #F8F0E3; }

  .font-options {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  .font-btn {
    flex: 1;
    padding: 10px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 2px solid transparent;
    transition: all var(--transition-fast);
  }

  .font-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .slider-row {
    margin-top: var(--space-sm);
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .slider-value {
    font-size: 13px;
    color: var(--accent);
    font-weight: 600;
  }

  .slider {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border);
    border-radius: 2px;
    outline: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }

  .preview-box {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    transition: all var(--transition-normal);
  }

  .about {
    text-align: center;
    padding: var(--space-lg) 0;
  }

  .app-name {
    font-size: 18px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  .app-version {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  .app-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-top: 4px;
  }
</style>
