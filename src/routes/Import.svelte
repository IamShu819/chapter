<script lang="ts">
  import { bookStore, nav } from '../lib/stores/app.svelte';
  import { openFilePicker, detectFormat } from '../lib/utils/file-import';

  let importing = $state(false);
  let dragOver = $state(false);
  let importMessage = $state('');
  let messageType = $state<'success' | 'error' | 'info' | ''>('');
  let msgTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleImport() {
    const file = await openFilePicker();
    if (!file) return;
    await importFile(file);
  }

  async function importFile(file: File) {
    const format = detectFormat(file.name);
    if (!format) {
      showMsg('不支持的文件格式', 'error');
      return;
    }

    importing = true;
    importMessage = `正在导入: ${file.name}...`;

    try {
      const book = await bookStore.addBook(file);
      showMsg(`「${book.title}」导入成功！`, 'success');
      setTimeout(() => {
        importMessage = '';
        nav.navigate('bookshelf');
      }, 1500);
    } catch (e: any) {
      showMsg(`导入失败: ${e.message}`, 'error');
    } finally {
      importing = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) importFile(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function showMsg(msg: string, type: 'success' | 'error' | 'info') {
    if (msgTimer) clearTimeout(msgTimer);
    importMessage = msg;
    messageType = type;
    msgTimer = setTimeout(() => { importMessage = ''; messageType = ''; }, 4000);
  }

  const supportedFormats = [
    { ext: 'EPUB', desc: '电子书标准格式' },
    { ext: 'TXT', desc: '纯文本文档' },
    { ext: 'MD', desc: 'Markdown 文档' },
    { ext: 'PDF', desc: 'PDF 文档' },
    { ext: 'DOCX', desc: 'Word 文档' },
  ];
</script>

<div class="import-page fade-in">
  <header class="page-header">
    <h1 class="page-title">导入书籍</h1>
  </header>

  <div class="page page-padded">
      <button
        class="drop-zone"
        class:drag-over={dragOver}
        class:importing
        onclick={handleImport}
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
      >
        <div class="drop-icon">
          {#if importing}
            <div class="spinner"></div>
          {:else}
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          {/if}
        </div>
        <p class="drop-text">
          {#if importing}
            正在处理...
          {:else}
            点击选择文件
          {/if}
        </p>
        <p class="drop-sub">支持拖拽导入</p>
      </button>

      <div class="formats">
        <h3 class="formats-title">支持的格式</h3>
        <div class="format-list">
          {#each supportedFormats as fmt}
            <div class="format-item">
              <span class="format-icon">{fmt.ext}</span>
              <div>
                <p class="format-ext">.{fmt.ext}</p>
                <p class="format-desc">{fmt.desc}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

    {#if importMessage}
      <div
        class="message"
        class:success={messageType === 'success'}
        class:error={messageType === 'error'}
        class:info={messageType === 'info'}
      >
        {importMessage}
      </div>
    {/if}

    <div class="tips">
      <h3 class="tips-title">使用提示</h3>
      <ul class="tips-list">
        <li>点击文本中的任意字词可查看释义</li>
        <li>阅读进度会自动保存</li>
        <li>支持 EPUB、TXT、Markdown、PDF、Word 五种格式</li>
        <li>所有书籍存储在本地，无需联网</li>
      </ul>
    </div>
  </div>
</div>

<style>
  .import-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .page-header {
    padding: 16px var(--space-md) 0;
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    flex-shrink: 0;
  }

  .page-title {
    font-size: 22px;
    font-weight: 700;
    font-family: var(--font-serif);
  }

  /* Drop Zone */
  .drop-zone {
    width: 100%;
    padding: var(--space-xl) var(--space-md);
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    transition: all var(--transition-normal);
    color: var(--text-secondary);
    -webkit-tap-highlight-color: transparent;
    margin-top: var(--space-md);
  }

  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .drop-zone.importing {
    pointer-events: none;
    opacity: 0.7;
  }

  .drop-icon { color: var(--accent); }

  .drop-text {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .drop-sub {
    font-size: 13px;
    color: var(--text-muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Message */
  .message {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 14px;
    text-align: center;
    animation: fadeIn var(--transition-fast);
  }

  .message.success {
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
  }

  .message.error {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
  }

  /* Formats */
  .formats, .tips {
    margin-top: var(--space-lg);
  }

  .formats-title, .tips-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: var(--space-sm);
  }

  .format-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .format-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
  }

  .format-icon {
    width: 44px;
    height: 32px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .format-ext { font-size: 14px; font-weight: 600; }
  .format-desc { font-size: 12px; color: var(--text-muted); }

  .tips-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tips-list li {
    font-size: 14px;
    color: var(--text-secondary);
    padding-left: 16px;
    position: relative;
  }

  .tips-list li::before {
    content: '·';
    position: absolute;
    left: 0;
    color: var(--accent);
    font-weight: bold;
  }
</style>
