// Gạch chân từ vựng đang học trên mọi trang web.

(async () => {
  if (location.protocol === 'chrome-extension:') return;
  if (!document.body) return;

  const { vocabulary, settings } = await chrome.storage.local.get(['vocabulary', 'settings']);
  if (settings?.highlightEnabled === false) return;

  const wordMap = new Map();
  for (const e of (vocabulary || [])) {
    if (e.word) wordMap.set(e.word.toLowerCase().trim(), e);
  }
  if (!wordMap.size) return;

  let pattern;
  try {
    const parts = [...wordMap.keys()]
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    pattern = new RegExp(`\\b(${parts.join('|')})\\b`, 'gi');
  } catch { return; }

  // ---- Tooltip (tạo lazy lần đầu hover) ----
  let tip = null;
  let hideTimer = null;
  let currentWord = null;

  function getTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.style.cssText = [
      'position:fixed', 'z-index:2147483647',
      'background:#1e293b', 'color:#f1f5f9',
      'border-radius:10px', 'padding:10px 14px',
      'font-size:13px', 'line-height:1.55',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'max-width:260px', 'box-shadow:0 6px 24px rgba(0,0,0,.4)',
      'pointer-events:none', 'display:none', 'top:0', 'left:0',
      'border:1px solid rgba(255,255,255,.08)',
    ].join(';');
    document.body.appendChild(tip);
    return tip;
  }

  function showTip(entry, x, y) {
    const t = getTip();
    clearTimeout(hideTimer);
    t.textContent = '';

    const row = t.appendChild(document.createElement('div'));
    row.style.cssText = 'display:flex;align-items:baseline;gap:6px';
    const wEl = row.appendChild(document.createElement('strong'));
    wEl.style.cssText = 'font-size:15px;color:#f8fafc';
    wEl.textContent = entry.word;

    if (entry.ipa) {
      const iEl = row.appendChild(document.createElement('span'));
      iEl.style.cssText = 'color:#93c5fd;font-size:12px';
      iEl.textContent = entry.ipa;
    }
    if (entry.meanings?.length) {
      const mEl = t.appendChild(document.createElement('div'));
      mEl.style.cssText = 'color:#cbd5e1;font-size:12px;margin-top:5px';
      mEl.textContent = entry.meanings.join('; ');
    }
    const statusColors = { new: '#a78bfa', learning: '#60a5fa', known: '#34d399' };
    const statusLabels  = { new: 'Mới',    learning: 'Đang học', known: 'Đã biết' };
    const badge = t.appendChild(document.createElement('div'));
    badge.style.cssText = `color:${statusColors[entry.status] || '#60a5fa'};font-size:11px;margin-top:6px`;
    badge.textContent = '● ' + (statusLabels[entry.status] || entry.status);

    t.style.display = 'block';
    moveTip(x, y);
  }

  function moveTip(x, y) {
    if (!tip) return;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = x + 14, ly = y - th - 10;
    if (lx + tw > window.innerWidth - 8) lx = x - tw - 10;
    if (ly < 8) ly = y + 22;
    tip.style.left = lx + 'px';
    tip.style.top  = ly + 'px';
  }

  function hideTip() {
    hideTimer = setTimeout(() => {
      if (tip) tip.style.display = 'none';
      currentWord = null;
    }, 200);
  }

  // Dùng mouseover/mouseout thay vì mousemove — đơn giản hơn, không cần RAF
  document.addEventListener('mouseover', (e) => {
    const sp = e.target.closest?.('span[data-rl]');
    if (!sp) return;
    clearTimeout(hideTimer);
    const word = sp.dataset.rl;
    const entry = wordMap.get(word);
    if (!entry) return;
    if (currentWord !== word) {
      currentWord = word;
      showTip(entry, e.clientX, e.clientY);
    }
  });
  document.addEventListener('mousemove', (e) => {
    if (e.target.closest?.('span[data-rl]')) moveTip(e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('span[data-rl]')) hideTip();
  });

  // ---- Walk: wrap matching words trong element root ----
  const SKIP = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT',
    'CODE', 'PRE', 'IFRAME', 'SVG', 'CANVAS',
  ]);
  let walking = false; // tránh observer tự trigger lại

  function walk(root) {
    if (walking || !root || root.nodeType !== Node.ELEMENT_NODE) return;
    walking = true;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
        let el = node.parentElement;
        while (el) {
          if (el === tip) return NodeFilter.FILTER_REJECT;
          if (SKIP.has(el.tagName) || el.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (el.dataset?.rl !== undefined) return NodeFilter.FILTER_REJECT; // đã wrap
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const tn of nodes) {
      const text = tn.textContent;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = pattern.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const sp = document.createElement('span');
        sp.dataset.rl = m[0].toLowerCase();
        sp.style.cssText = 'border-bottom:2px solid #3b82f6;cursor:help;border-radius:1px';
        sp.textContent = m[0];
        frag.appendChild(sp);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode?.replaceChild(frag, tn);
    }

    walking = false;
  }

  // ---- MutationObserver: walk content mới ngay khi xuất hiện ----
  // Xử lý cả React render lần đầu lẫn Blinkist load content theo scroll
  const observer = new MutationObserver((mutations) => {
    if (walking) return;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        // Bỏ qua span của chính mình và text node
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.dataset?.rl !== undefined) continue;
        walk(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Walk nội dung đã có sẵn (static pages, hoặc content trước khi observer bắt đầu)
  setTimeout(() => walk(document.body), 600);
})();
