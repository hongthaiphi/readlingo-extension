// Hàm SELF-CONTAINED, được inject vào trang qua chrome.scripting.executeScript({func}).
// KHÔNG được tham chiếu biến ngoài scope (Chrome serialize bằng toString()).

export function extractArticle() {
  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  // Nếu có selection -> chỉ lấy phần bôi đen.
  const sel = window.getSelection?.().toString();
  if (sel && sel.trim().length > 40) {
    const paras = sel.split(/\n+/).map(clean).filter((p) => p.length > 0);
    return {
      title: clean(document.title),
      byline: "",
      url: location.href,
      siteName: location.hostname,
      paragraphs: paras,
      source: "selection",
    };
  }

  // Lọc phần giao diện/điều hướng, không phải nội dung đọc.
  const SKIP = /(nav|footer|header|aside|menu|comment|sidebar|advert|promo|share|social|cookie|newsletter|related|breadcrumb|paywall|upsell|toolbar|settings|caption|byline|meta)/i;
  const CHROME_TAGS = ["nav", "footer", "header", "aside", "button", "a", "select", "textarea", "input", "label", "form"];
  const CHROME_ROLES = ["navigation", "button", "menu", "menubar", "tablist", "tab", "toolbar", "banner", "contentinfo"];
  const MIN = 12; // số ký tự text tối thiểu để coi là 1 đoạn nội dung

  function visible(el) {
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || +st.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  // True nếu el nằm trong vùng giao diện (nav/footer/link/button/promo...).
  function isChrome(el) {
    let cur = el;
    for (let d = 0; cur && d < 12; d++) {
      const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
      if (CHROME_TAGS.includes(tag)) return true;
      const role = cur.getAttribute && cur.getAttribute("role");
      if (role && CHROME_ROLES.includes(role)) return true;
      const idc = ((cur.id || "") + " " + (cur.className || "")).toString();
      if (SKIP.test(idc)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  // Độ dài text NẰM TRỰC TIẾP trong el (không tính text của thẻ con).
  // Đây là chìa khóa: chọn đúng phần tử "lá" chứa câu, bất kể là <p>, <span>, <div>...
  function directTextLen(el) {
    let s = "";
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.textContent;
    return s.trim().length;
  }

  // Thu thập ứng viên: phần tử có text trực tiếp đủ dài, không phải giao diện.
  const candidates = [];
  const SELECTOR = "p,li,blockquote,h1,h2,h3,h4,h5,h6,span,div,dd,dt,figcaption,td";
  document.body.querySelectorAll(SELECTOR).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const min = /^h[1-6]$/.test(tag) ? 2 : MIN;
    if (directTextLen(el) < min) return;
    if (!visible(el)) return;
    if (isChrome(el)) return;
    candidates.push(el);
  });

  // Loại lồng nhau: nếu một ứng viên nằm trong ứng viên khác thì bỏ (giữ phần lá).
  const set = new Set(candidates);
  let paragraphs = [];
  for (const el of candidates) {
    let anc = el.parentElement;
    let nested = false;
    while (anc) {
      if (set.has(anc)) { nested = true; break; }
      anc = anc.parentElement;
    }
    if (nested) continue;
    const text = clean(el.innerText);
    if (text.length >= 2) paragraphs.push(text);
  }

  // Loại trùng (liên tiếp và toàn cục).
  const seen = new Set();
  paragraphs = paragraphs.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });

  // Fallback cho trang lạ: nếu không lấy được gì, dùng cách cũ theo <p>, rồi tới body.
  if (paragraphs.length < 3) {
    const ps = [...document.querySelectorAll("p")]
      .map((p) => clean(p.innerText))
      .filter((t) => t.length >= MIN);
    if (ps.length >= 3) paragraphs = ps;
    else paragraphs = clean(document.body.innerText).split(/\n+/).map(clean).filter((t) => t.length >= MIN);
  }

  const byline =
    clean(document.querySelector('[rel="author"], .author, .byline, meta[name="author"]')?.content) ||
    clean(document.querySelector('[rel="author"], .author, .byline')?.innerText) ||
    "";
  const siteName =
    document.querySelector('meta[property="og:site_name"]')?.content || location.hostname;
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content;

  return {
    title: clean(ogTitle || document.title),
    byline,
    url: location.href,
    siteName: clean(siteName),
    paragraphs,
    source: "article",
  };
}
