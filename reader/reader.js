import { paragraphsToSentences } from "../utils/segment.js";
import { tokenizeSentence } from "../utils/difficulty.js";
import { translateSentences } from "../utils/translate.js";
import { lookupWord } from "../utils/dictionary.js";
import {
  getSettings, setSettings, getVocabulary, saveWord, markKnown, findWord, addHistory,
} from "../utils/storage.js";

const PAGE_SIZE = 40;

const state = {
  doc: null,
  sentences: [],
  pages: [],
  page: 0,
  translations: {},
  translatedPages: new Set(),
  savedWords: new Set(),
  knownWords: new Set(),
  settings: null,
  showVi: true,
};

// ---------- TTS state ----------
const tts = {
  active: false,
  idx: -1,       // globalIdx hiện đang đọc
};
let cachedVoices = null;

function getVoicesReady() {
  if (cachedVoices?.length) return Promise.resolve(cachedVoices);
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) { cachedVoices = v; return resolve(v); }
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => { cachedVoices = speechSynthesis.getVoices(); resolve(cachedVoices); },
      { once: true }
    );
  });
}

function pickEnglishVoice(voices) {
  // Ưu tiên giọng en-US, fallback en-*
  return (
    voices.find((v) => v.lang === "en-US" && !v.name.includes("Compact")) ||
    voices.find((v) => v.lang.startsWith("en-US")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    null
  );
}

async function playFrom(globalIdx) {
  stopPlay(false); // dừng nhưng không xoá trạng thái tts.active ngay
  tts.active = true;
  tts.idx = globalIdx;
  $("#stop-play").classList.remove("hidden");
  await readNext();
}

async function readNext() {
  if (!tts.active) return;
  const idx = tts.idx;
  if (idx >= state.sentences.length) { stopPlay(); return; }

  // Chuyển trang nếu cần
  const targetPage = Math.floor(idx / PAGE_SIZE);
  if (targetPage !== state.page) {
    if (targetPage >= state.pages.length) { stopPlay(); return; }
    await renderPage(targetPage);
    // Sau renderPage, tts có thể bị cancel — kiểm tra lại
    if (!tts.active || tts.idx !== idx) return;
  }

  // Highlight row đang đọc
  markSpeaking(idx);

  const sentText = state.sentences[idx];
  if (!sentText?.trim()) {
    // Câu rỗng → bỏ qua, đọc câu tiếp theo
    tts.idx = idx + 1;
    return readNext();
  }

  const voices = await getVoicesReady();
  const voice = pickEnglishVoice(voices);

  const u = new SpeechSynthesisUtterance(sentText);
  u.lang = "en-US";
  u.rate = 0.88;
  if (voice) u.voice = voice;

  u.onend = () => {
    if (!tts.active || tts.idx !== idx) return;
    tts.idx = idx + 1;
    readNext();
  };
  u.onerror = (e) => {
    if (e.error === "interrupted" || e.error === "canceled") return;
    console.warn("TTS error:", e.error);
    stopPlay();
  };

  speechSynthesis.speak(u);
}

function stopPlay(resetBtn = true) {
  tts.active = false;
  speechSynthesis.cancel();
  document.querySelectorAll(".row.speaking").forEach((r) => r.classList.remove("speaking"));
  if (resetBtn) $("#stop-play")?.classList.add("hidden");
}

function markSpeaking(globalIdx) {
  document.querySelectorAll(".row.speaking").forEach((r) => r.classList.remove("speaking"));
  const row = document.querySelector(`.row[data-idx="${globalIdx}"]`);
  if (row) {
    row.classList.add("speaking");
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    // Cập nhật icon play-btn thành ■ (đang đọc)
    const btn = row.querySelector(".play-btn");
    if (btn) btn.textContent = "■";
  }
}

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);

async function init() {
  state.settings = await getSettings();
  state.showVi = state.settings.showTranslationByDefault;
  applyTheme(state.settings.theme);
  if (!state.showVi) document.body.classList.add("hide-vi");

  // Pre-load voices sớm để tránh delay lần đầu
  getVoicesReady();

  await loadVocabSets();

  const id = new URLSearchParams(location.search).get("id");
  const store = id ? await chrome.storage.session.get(id) : {};
  const doc = store[id];

  if (!doc || doc.error) {
    // doc.error từ service worker của chính extension, nhưng vẫn dùng textContent để an toàn
    const msg = document.createElement("div");
    msg.className = "empty";
    msg.textContent = doc?.error || "Không có nội dung. Hãy right-click trên một trang web và chọn 'Read in ReadLingo'.";
    $("#reader").innerHTML = "";
    $("#reader").appendChild(msg);
    $("#doc-title").textContent = "ReadLingo";
    return;
  }

  state.doc = doc;
  $("#doc-title").textContent = doc.title || "ReadLingo";

  // Build doc-meta an toàn: không dùng innerHTML với dữ liệu trang
  const meta = $("#doc-meta");
  meta.textContent = "";
  if (doc.byline) {
    const span = document.createElement("span");
    span.textContent = doc.byline;       // ← textContent, không phải innerHTML
    meta.appendChild(span);
  }
  if (doc.url && isSafeUrl(doc.url)) {   // ← chỉ cho phép http/https
    if (doc.byline) meta.appendChild(document.createTextNode(" · "));
    const a = document.createElement("a");
    a.href = doc.url;
    a.textContent = doc.siteName || "nguồn";   // ← textContent
    a.target = "_blank";
    a.rel = "noopener noreferrer";              // ← chống tab-napping
    meta.appendChild(a);
  }

  state.sentences = paragraphsToSentences(doc.paragraphs || []);
  for (let i = 0; i < state.sentences.length; i += PAGE_SIZE) {
    state.pages.push(state.sentences.slice(i, i + PAGE_SIZE));
  }
  if (!state.pages.length) state.pages.push([]);

  addHistory({ url: doc.url, title: doc.title, wordCount: state.sentences.join(" ").split(/\s+/).length });

  bindUI();
  await renderPage(0);
}

async function loadVocabSets() {
  const vocab = await getVocabulary();
  state.savedWords = new Set(vocab.filter((v) => v.status !== "known").map((v) => v.word.toLowerCase()));
  state.knownWords = new Set(vocab.filter((v) => v.status === "known").map((v) => v.word.toLowerCase()));
}

function pageOffset(page) {
  return page * PAGE_SIZE;
}

async function renderPage(page) {
  state.page = page;
  const reader = $("#reader");
  reader.innerHTML = "";
  const sents = state.pages[page] || [];
  const offset = pageOffset(page);
  const known = [...state.knownWords, ...state.savedWords];

  for (let i = 0; i < sents.length; i++) {
    const globalIdx = offset + i;
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.idx = String(globalIdx);

    // Nút play (ẩn, hiện khi hover row)
    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.title = "Đọc to từ đây";
    playBtn.textContent = "▶";
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (tts.active && tts.idx === globalIdx) {
        // Đang đọc câu này → dừng
        stopPlay();
      } else {
        // Bắt đầu đọc từ câu này
        playFrom(globalIdx);
      }
    };
    row.appendChild(playBtn);

    const en = document.createElement("div");
    en.className = "col-en";
    const tokens = await tokenizeSentence(sents[i], known);
    for (const t of tokens) {
      if (t.hard) {
        const span = document.createElement("span");
        const lower = t.text.toLowerCase().replace(/[^a-z'-]/g, "");
        const isSaved = state.savedWords.has(lower);
        span.className = "w " + (isSaved ? "saved" : "hard");
        span.textContent = t.text;
        span.dataset.word = lower;
        en.appendChild(span);
      } else {
        en.appendChild(document.createTextNode(t.text));
      }
    }

    const vi = document.createElement("div");
    vi.className = "col-vi loading";
    vi.textContent = state.translations[globalIdx] ?? "…";
    if (state.translations[globalIdx]) vi.classList.remove("loading");

    row.appendChild(en);
    row.appendChild(vi);

    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("w") || e.target.classList.contains("play-btn")) return;
      document.querySelectorAll(".row.active").forEach((r) => r.classList.remove("active"));
      row.classList.add("active");
    });

    reader.appendChild(row);
  }

  // Nếu đang phát và câu nằm trên trang mới vừa render → đánh dấu lại
  if (tts.active) markSpeaking(tts.idx);

  updatePager();
  reader.scrollIntoView({ block: "start" });
  if (!state.translatedPages.has(page)) translatePage(page);
}

async function translatePage(page) {
  state.translatedPages.add(page);
  const sents = state.pages[page] || [];
  const offset = pageOffset(page);
  await translateSentences(sents, (i, vi) => {
    const globalIdx = offset + i;
    state.translations[globalIdx] = vi;
    if (state.page === page) {
      const row = document.querySelector(`.row[data-idx="${globalIdx}"] .col-vi`);
      if (row) {
        row.textContent = vi || "(không dịch được)";
        row.classList.remove("loading");
      }
    }
  });
}

function updatePager() {
  $("#pageinfo").textContent = `${state.page + 1} / ${state.pages.length}`;
  $("#prev").disabled = state.page === 0;
  $("#next").disabled = state.page >= state.pages.length - 1;
  $("#progress-bar").style.width = `${((state.page + 1) / state.pages.length) * 100}%`;
}

function bindUI() {
  $("#prev").onclick = () => { if (state.page > 0) renderPage(state.page - 1); };
  $("#next").onclick = () => { if (state.page < state.pages.length - 1) renderPage(state.page + 1); };

  $("#stop-play").onclick = () => stopPlay();

  $("#toggle-vi").onclick = () => {
    state.showVi = !state.showVi;
    document.body.classList.toggle("hide-vi", !state.showVi);
    $("#toggle-vi").textContent = state.showVi ? "Ẩn dịch" : "Hiện dịch";
  };
  $("#toggle-vi").textContent = state.showVi ? "Ẩn dịch" : "Hiện dịch";

  $("#toggle-theme").onclick = async () => {
    const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = cur;
    await setSettings({ theme: cur });
  };

  // Hover → hiện popup nghĩa từ; rời cả từ lẫn popup → ẩn
  const reader = $("#reader");
  reader.addEventListener("mouseover", onWordHover);
  reader.addEventListener("mouseout", onWordOut);

  const popup = $("#word-popup");
  popup.addEventListener("mouseenter", cancelHide);
  popup.addEventListener("mouseleave", scheduleHide);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") $("#next").click();
    if (e.key === "ArrowLeft") $("#prev").click();
    if (e.key === "Escape") { hidePopup(); stopPlay(); }
    if (e.key === " ") { e.preventDefault(); tts.active ? stopPlay() : null; }
  });

  bindPopupActions();
}

// ---------- Word popup (hover) ----------
let currentWord = null;
let currentExample = "";
let hideTimer = null;
let showTimer = null;

function cancelHide() {
  clearTimeout(hideTimer);
  hideTimer = null;
}

function scheduleHide() {
  cancelHide();
  hideTimer = setTimeout(hidePopup, 250);
}

function onWordHover(e) {
  const el = e.target.closest(".w");
  if (!el) return;
  cancelHide();
  const word = el.dataset.word;
  if (word === currentWord && !$("#word-popup").classList.contains("hidden")) return;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    const row = el.closest(".row");
    currentExample = row?.querySelector(".col-en")?.textContent.trim() || "";
    showPopup(el, word);
  }, 120);
}

function onWordOut(e) {
  const el = e.target.closest(".w");
  if (!el) return;
  clearTimeout(showTimer);
  scheduleHide();
}

async function showPopup(anchor, word) {
  currentWord = word;
  const popup = $("#word-popup");
  $("#wp-word").textContent = word;
  $("#wp-ipa").textContent = "";
  $("#wp-pos").textContent = "";
  $("#wp-meaning").textContent = "Đang tra…";

  const saved = await findWord(word);
  $("#wp-save").textContent = saved ? "✓ Đã trong danh sách" : "+ Cho vào danh sách học";
  $("#wp-save").disabled = !!saved;

  positionPopup(popup, anchor);
  popup.classList.remove("hidden");

  const info = await lookupWord(word);
  if (currentWord !== word) return;
  $("#wp-ipa").textContent = info.ipa || "";
  $("#wp-pos").textContent = info.pos || "";
  const vi = info.meaningsVi[0] || "";
  const def = info.defs[0] || "";

  // Dùng DOM API thay vì innerHTML để tránh XSS từ API response
  const meaning = $("#wp-meaning");
  meaning.textContent = "";
  if (vi) {
    const b = document.createElement("b");
    b.textContent = vi;
    meaning.appendChild(b);
  }
  if (def) {
    const d = document.createElement("div");
    d.style.cssText = "font-size:13px;color:var(--text-dim);margin-top:4px";
    d.textContent = def;
    meaning.appendChild(d);
  }
  if (!vi && !def) meaning.textContent = "Không tìm thấy nghĩa.";

  popup.dataset.ipa = info.ipa || "";
  popup.dataset.pos = info.pos || "";
  popup.dataset.vi = vi;
  popup.dataset.audio = info.audio || "";
}

function positionPopup(popup, anchor) {
  const r = anchor.getBoundingClientRect();
  popup.classList.remove("hidden");
  const pw = 280;
  let left = window.scrollX + r.left;
  if (left + pw > window.scrollX + window.innerWidth - 12) {
    left = window.scrollX + window.innerWidth - pw - 12;
  }
  popup.style.left = `${Math.max(window.scrollX + 8, left)}px`;
  popup.style.top = `${window.scrollY + r.bottom + 6}px`;
}

function hidePopup() {
  clearTimeout(showTimer);
  cancelHide();
  $("#word-popup").classList.add("hidden");
  currentWord = null;
}

function bindPopupActions() {
  const popup = $("#word-popup");

  // 🔊 Phát âm từ đơn — dùng audio dict hoặc Web Speech API
  $("#wp-audio").onclick = () => {
    const audio = popup.dataset.audio;
    if (audio) {
      const src = audio.startsWith("//") ? "https:" + audio : audio;
      const a = new Audio(src);
      a.play().catch(() => speakWord(currentWord));
    } else {
      speakWord(currentWord);
    }
  };

  $("#wp-save").onclick = async () => {
    if (!currentWord) return;
    const { saved } = await saveWord({
      word: currentWord,
      ipa: popup.dataset.ipa || "",
      pos: popup.dataset.pos || "",
      meanings: popup.dataset.vi ? [popup.dataset.vi] : [],
      example: currentExample,
      sourceUrl: state.doc?.url || "",
      sourceName: state.doc?.title || state.doc?.siteName || "",
    });
    state.savedWords.add(currentWord);
    markSavedInDom(currentWord);
    toast(saved ? "Đã lưu từ ✓" : "Từ đã có trong danh sách");
    hidePopup();
  };

  $("#wp-known").onclick = async () => {
    if (!currentWord) return;
    await markKnown(currentWord);
    state.knownWords.add(currentWord);
    state.savedWords.delete(currentWord);
    unmarkInDom(currentWord);
    toast("Đã đánh dấu 'đã biết'");
    hidePopup();
  };
}

// Phát âm một từ đơn qua Web Speech API (đảm bảo voices đã tải)
async function speakWord(word) {
  if (!word) return;
  const voices = await getVoicesReady();
  const voice = pickEnglishVoice(voices);
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.85;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function markSavedInDom(word) {
  document.querySelectorAll(`.w[data-word="${CSS.escape(word)}"]`).forEach((el) => {
    el.classList.remove("hard");
    el.classList.add("saved");
  });
}
function unmarkInDom(word) {
  document.querySelectorAll(`.w[data-word="${CSS.escape(word)}"]`).forEach((el) => {
    el.classList.remove("hard", "saved", "w");
  });
}

function applyTheme(theme) {
  if (theme === "auto") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

// Chỉ cho phép http/https — chặn javascript: data: blob: v.v.
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

init();
