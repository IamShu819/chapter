export function openFilePicker(accept: string = '.epub,.txt,.pdf,.md,.docx'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = false;
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

export function detectFormat(filename: string): 'epub' | 'txt' | 'pdf' | 'md' | 'docx' | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, 'epub' | 'txt' | 'pdf' | 'md' | 'docx'> = {
    epub: 'epub',
    txt: 'txt',
    pdf: 'pdf',
    md: 'md',
    markdown: 'md',
    docx: 'docx',
  };
  return map[ext!] ?? null;
}
