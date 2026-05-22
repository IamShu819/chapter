import * as pdfjs from 'pdfjs-dist';

// Use new URL() which Vite transforms at build time
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default pdfjs;
