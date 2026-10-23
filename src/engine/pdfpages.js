/**
 * PDF をページごとの画像にする（全面表示で印を付けるため）。pdf.js は PDF を開いたときに初めて読み込む。
 * 1 つの PDF は 1 回だけ描き、ページの画像は覚えておく（描き直しのたびに作らない）。
 */
const MAX_PAGES = 60;   // これより長い PDF は先頭だけ描く（残りは「別のタブで開く」）
const SCALE = 1.6;      // 画面で拡大しても文字が読める細かさ
let lib = null;
const CACHE = new Map();

export function loadPdf(url, onProgress) {
  if (CACHE.has(url)) return CACHE.get(url);
  const st = { pages: [], total: 0, done: false, err: "", capped: false };
  CACHE.set(url, st);
  (async () => {
    try {
      if (!lib) {
        const [m, w] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
        lib = m; lib.GlobalWorkerOptions.workerSrc = w.default;
      }
      const doc = await lib.getDocument({ url }).promise;
      st.total = doc.numPages; onProgress();
      const max = Math.min(doc.numPages, MAX_PAGES);
      for (let i = 1; i <= max; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: SCALE });
        const c = document.createElement("canvas");
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
        st.pages.push({ src: URL.createObjectURL(blob), w: c.width, h: c.height });
        onProgress();
      }
      st.capped = doc.numPages > max;
    } catch (e) {
      st.err = `PDF を読み込めませんでした（${String(e?.message || e).slice(0, 80)}）`;
    }
    st.done = true; onProgress();
  })();
  return st;
}
