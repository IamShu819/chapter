import JSZip from 'jszip';

export interface EpubChapter {
  id: string;
  title: string;
  html: string;
  href: string;
  order: number;
}

export interface EpubMeta {
  title: string;
  author: string;
  coverBlob?: Blob;
  chapters: EpubChapter[];
}

export interface EpubParseOptions {
  includeHtml?: boolean;
  chapterIndex?: number;
}

/**
 * Parse an EPUB file using JSZip — no epubjs, no xmldom, no shadow DOM.
 * Returns metadata + chapter HTML strings ready for direct rendering.
 */
export async function parseEpub(file: File, options: EpubParseOptions = {}): Promise<EpubMeta> {
  const includeHtml = options.includeHtml ?? true;
  const zip = await JSZip.loadAsync(file);

  // 1. Read META-INF/container.xml → find OPF path
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Invalid EPUB: missing container.xml');
  const containerXml = await containerFile.async('text');
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('Invalid EPUB: no OPF found');

  const opfDir = opfPath.replace(/[^/]+$/, '');

  // 2. Read OPF file
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('Invalid EPUB: OPF file not found at ' + opfPath);
  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'text/xml');

  // 3. Extract metadata
  const title = opfDoc.querySelector('metadata title')?.textContent
    || opfDoc.querySelector('dc\\:title')?.textContent
    || file.name;
  const author = opfDoc.querySelector('metadata creator')?.textContent
    || opfDoc.querySelector('dc\\:creator')?.textContent
    || '未知';

  // 4. Build manifest: id → href
  const manifest: Record<string, string> = {};
  for (const item of opfDoc.querySelectorAll('manifest item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest[id] = opfDir + href;
  }

  // 5. Build spine (reading order)
  const spineIds: string[] = [];
  for (const itemRef of opfDoc.querySelectorAll('spine itemref')) {
    const idref = itemRef.getAttribute('idref');
    if (idref && manifest[idref]) spineIds.push(idref);
  }

  // 6. Extract TOC from NCX or nav document
  let tocMap: Record<string, string> = {};
  // Try nav document first (EPUB 3)
  const navItem = opfDoc.querySelector('item[properties*="nav"]');
  if (navItem) {
    const navId = navItem.getAttribute('id');
    const navHref = navId ? manifest[navId] : undefined;
    if (navHref) {
      const navFile = zip.file(navHref);
      if (navFile) {
        const navHtml = await navFile.async('text');
        const navDoc = new DOMParser().parseFromString(navHtml, 'text/html');
        const tocList = navDoc.querySelector('nav[*|type="toc"] ol')
          || navDoc.querySelector('nav.toc ol')
          || navDoc.querySelector('ol');
        if (tocList) {
          for (const a of tocList.querySelectorAll('a')) {
            const href = a.getAttribute('href') || '';
            const baseHref = href.split('#')[0];
            const label = a.textContent?.trim() || '';
            if (baseHref) tocMap[baseHref] = label;
          }
        }
      }
    }
  }
  // Try NCX (EPUB 2)
  if (Object.keys(tocMap).length === 0) {
    const ncxItem = opfDoc.querySelector('spine')?.getAttribute('toc');
    if (ncxItem && manifest[ncxItem]) {
      const ncxHref = manifest[ncxItem];
      const ncxFile = zip.file(ncxHref);
      if (ncxFile) {
        const ncxXml = await ncxFile.async('text');
        const ncxDoc = new DOMParser().parseFromString(ncxXml, 'text/xml');
        for (const navPoint of ncxDoc.querySelectorAll('navPoint')) {
          const src = navPoint.querySelector('content')?.getAttribute('src') || '';
          const label = navPoint.querySelector('text')?.textContent?.trim() || '';
          const baseSrc = src.split('#')[0];
          if (baseSrc) tocMap[baseSrc] = label;
        }
      }
    }
  }

  // 7. Extract cover image
  let coverBlob: Blob | undefined;
  // Try item with cover-image property first
  let coverItem = opfDoc.querySelector('item[properties*="cover-image"]');
  if (coverItem) {
    const href = coverItem.getAttribute('href');
    if (href) {
      const fullPath = opfDir + href;
      const coverFile = zip.file(fullPath);
      if (coverFile) {
        const ext = fullPath.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        const data = await coverFile.async('arraybuffer');
        coverBlob = new Blob([data], { type: mime });
      }
    }
  }
  // Try item with "cover" in id
  if (!coverBlob) {
    coverItem = opfDoc.querySelector('item[id*="cover"][href*="jpg"], item[id*="cover"][href*="png"], item[id*="cover"][href*="jpeg"]');
    if (coverItem) {
      const href = coverItem.getAttribute('href');
      if (href) {
        const fullPath = opfDir + href;
        const coverFile = zip.file(fullPath);
        if (coverFile) {
          const ext = fullPath.split('.').pop()?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const data = await coverFile.async('arraybuffer');
          coverBlob = new Blob([data], { type: mime });
        }
      }
    }
  }
  // Try meta[name="cover"] — content attribute points to a manifest item ID
  if (!coverBlob) {
    const metaCover = opfDoc.querySelector('meta[name="cover"]');
    if (metaCover) {
      const coverId = metaCover.getAttribute('content') || '';
      if (coverId && manifest[coverId]) {
        const coverHref = manifest[coverId];
        const coverFile = zip.file(coverHref);
        if (coverFile) {
          const ext = coverHref.split('.').pop()?.toLowerCase() || 'jpg';
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const data = await coverFile.async('arraybuffer');
          coverBlob = new Blob([data], { type: mime });
        }
      }
    }
  }

  // 8. Load chapter HTML
  const chapters: EpubChapter[] = [];
  for (let i = 0; i < spineIds.length; i++) {
    const href = manifest[spineIds[i]];
    if (!href || !zip.file(href)) continue;

    const shouldLoadHtml = includeHtml && (
      options.chapterIndex === undefined || options.chapterIndex === i
    );
    let html = '';

    if (shouldLoadHtml) {
      const chapterFile = zip.file(href);
      if (!chapterFile) continue;
      html = await chapterFile.async('text');
      html = extractBodyHtml(html);
      html = await rewriteAssetPaths(html, href, zip);
    }

    // Find chapter title from TOC
    const shortHref = href.split('/').pop() || href;
    const tocTitle = tocMap[shortHref] || tocMap[href]
      || Object.entries(tocMap).find(([k]) => href.endsWith(k))?.[1];

    chapters.push({
      id: spineIds[i],
      title: tocTitle || `第 ${i + 1} 章`,
      html,
      href,
      order: i,
    });
  }

  if (chapters.length === 0) {
    throw new Error('EPUB 中未找到章节内容');
  }

  return { title, author, coverBlob, chapters };
}

function extractBodyHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body?.innerHTML?.trim() || html;
}

/**
 * Rewrite relative image paths in HTML to data URIs so images display inline.
 */
async function rewriteAssetPaths(html: string, chapterPath: string, zip: JSZip): Promise<string> {
  const dir = chapterPath.replace(/[^/]+$/, '');

  const replacements: { from: string; to: string }[] = [];
  const addAssetReplacement = async (url: string) => {
    if (!url || url.startsWith('data:') || /^https?:\/\//i.test(url) || url.startsWith('#')) return;
    const cleanUrl = decodeURIComponent(url.split('#')[0].split('?')[0]);
    const resolved = resolvePath(dir, cleanUrl);
    const file = zip.file(resolved);
    if (!file) return;

    try {
      const ext = resolved.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      const data = await file.async('base64');
      replacements.push({ from: url, to: `data:${mime};base64,${data}` });
    } catch {}
  };

  const attrRegex = /\b(?:src|href|xlink:href)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(html)) !== null) {
    await addAssetReplacement(match[1]);
  }

  for (const r of replacements) {
    html = html.split(r.from).join(r.to);
  }

  return html;
}

function resolvePath(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1);
  const parts = (base + rel).split('/');
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p !== '.') resolved.push(p);
  }
  return resolved.join('/');
}
