import { getVocabulary, updateWord, deleteWord, getStats, getSettings, setSettings } from "../utils/storage.js";
import { dueForReview, applyReview, previewIntervals } from "../utils/srs.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- Tabs ----------
$$(".tab").forEach((tab) => {
  tab.onclick = () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`#tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "review") startReview();
    if (tab.dataset.tab === "stats") renderStats();
    if (tab.dataset.tab === "settings") loadSettings();
  };
});

// ---------- Tab: Từ của tôi ----------
let allWords = [];

async function loadWords() {
  allWords = await getVocabulary();
  renderWords();
}

function renderWords() {
  const q = $("#search").value.trim().toLowerCase();
  const status = $("#filter-status").value;
  let list = allWords;
  if (status) list = list.filter((w) => w.status === status);
  if (q) list = list.filter((w) => w.word.toLowerCase().includes(q) || (w.meanings || []).join(" ").toLowerCase().includes(q));
  list = list.slice().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const container = $("#word-list");
  $("#count").textContent = `${list.length} từ`;
  if (!list.length) {
    container.innerHTML = `<div class="empty">Chưa có từ nào. Hãy đọc một trang web với "Read in ReadLingo" và lưu từ khó.</div>`;
    return;
  }
  container.innerHTML = "";
  for (const w of list) {
    const el = document.createElement("div");
    el.className = "word-item";
    const statusLabel = { new: "Mới", learning: "Đang học", known: "Đã biết" }[w.status] || w.status;
    el.innerHTML = `
      <div class="wi-head">
        <span class="wi-word">${esc(w.word)}</span>
        <span class="wi-ipa">${esc(w.ipa || "")}</span>
        <span class="wi-status ${w.status}">${statusLabel}</span>
      </div>
      ${w.meanings?.length ? `<div class="wi-meaning">${esc(w.meanings.join("; "))}</div>` : ""}
      ${w.example ? `<div class="wi-example">"${esc(w.example)}"</div>` : ""}
      ${w.sourceName ? `<div class="wi-src">${esc(w.sourceName)}</div>` : ""}
      <div class="wi-actions">
        <button class="btn" data-act="speak">🔊</button>
        <button class="btn" data-act="cycle">Đổi trạng thái</button>
        <button class="btn" data-act="del">Xóa</button>
      </div>`;
    el.querySelector('[data-act="speak"]').onclick = () => speak(w.word);
    el.querySelector('[data-act="cycle"]').onclick = async () => {
      const order = ["new", "learning", "known"];
      const next = order[(order.indexOf(w.status) + 1) % order.length];
      await updateWord(w.id, { status: next });
      await loadWords();
    };
    el.querySelector('[data-act="del"]').onclick = async () => {
      await deleteWord(w.id);
      await loadWords();
    };
    container.appendChild(el);
  }
}

$("#search").oninput = renderWords;
$("#filter-status").onchange = renderWords;

$("#export").onclick = () => {
  const rows = [["front", "back", "example"]];
  for (const w of allWords) {
    rows.push([w.word, (w.meanings || []).join("; "), w.example || ""]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "readlingo-vocab.csv";
  a.click();
  URL.revokeObjectURL(url);
};

// ---------- Tab: Ôn tập ----------
let reviewQueue = [];
let reviewIdx = 0;

async function startReview() {
  const vocab = await getVocabulary();
  reviewQueue = dueForReview(vocab);
  reviewIdx = 0;
  if (!reviewQueue.length) {
    $("#review-empty").classList.remove("hidden");
    $("#flashcard").classList.add("hidden");
    return;
  }
  $("#review-empty").classList.add("hidden");
  $("#flashcard").classList.remove("hidden");
  showCard();
}

function fmtInterval(days) {
  if (days < 1)  return "< 1 ngày";
  if (days === 1) return "1 ngày";
  if (days < 30)  return `${days} ngày`;
  const months = Math.round(days / 30);
  return `${months} tháng`;
}

function showCard() {
  const w = reviewQueue[reviewIdx];
  if (!w) return startReview();

  $("#fc-progress").textContent = `${reviewIdx + 1} / ${reviewQueue.length}`;
  $("#fc-word").textContent = w.word;
  $("#fc-ipa").textContent = w.ipa || "";

  // Trạng thái SM-2 hiện tại
  const efDisplay = (w.ef ?? 2.5).toFixed(1);
  const reps = w.repetitions ?? 0;
  $("#fc-progress").title = `EF: ${efDisplay} · Lần ôn: ${reps}`;

  $("#fc-meaning").textContent = (w.meanings || []).join("; ") || "(chưa có nghĩa)";
  $("#fc-example").textContent = w.example ? `"${w.example}"` : "";
  $("#fc-back").classList.add("hidden");
  $("#fc-reveal").classList.remove("hidden");

  // Tính trước interval của từng nút để hiển thị
  const preview = previewIntervals(w);
  $("#fc-iv-again").textContent = fmtInterval(preview.again);
  $("#fc-iv-hard").textContent  = fmtInterval(preview.hard);
  $("#fc-iv-easy").textContent  = fmtInterval(preview.easy);
}

$("#fc-reveal").onclick = () => {
  $("#fc-back").classList.remove("hidden");
  $("#fc-reveal").classList.add("hidden");
};
$("#fc-word").onclick = () => speak(reviewQueue[reviewIdx]?.word);

async function grade(quality) {
  const w = reviewQueue[reviewIdx];
  const updated = applyReview(w, quality);
  await updateWord(w.id, updated);
  reviewIdx++;
  if (reviewIdx >= reviewQueue.length) startReview();
  else showCard();
}
$("#fc-again").onclick = () => grade(1);
$("#fc-hard").onclick  = () => grade(3);
$("#fc-easy").onclick  = () => grade(5);

// ---------- Tab: Thống kê ----------
async function renderStats() {
  const vocab = await getVocabulary();
  const stats = await getStats();
  $("#s-total").textContent = vocab.length;
  $("#s-streak").textContent = stats.streakDays || 0;
  $("#s-new").textContent = vocab.filter((w) => w.status === "new").length;
  $("#s-known").textContent = vocab.filter((w) => w.status === "known").length;

  const bySrc = {};
  for (const w of vocab) {
    if (!w.sourceName) continue;
    bySrc[w.sourceName] = (bySrc[w.sourceName] || 0) + 1;
  }
  const top = Object.entries(bySrc).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("#top-sources").innerHTML = top.length
    ? top.map(([name, n]) => `<div class="src-row"><span>${esc(name)}</span><span class="muted">${n}</span></div>`).join("")
    : `<div class="muted">Chưa có dữ liệu.</div>`;
}

// ---------- Tab: Cài đặt ----------
const DEEPL_SIGNUP = "https://www.deepl.com/pro-api";

async function loadSettings() {
  const s = await getSettings();

  // Toggle gạch chân
  $("#highlight-enabled").checked = s.highlightEnabled !== false;

  // Chọn radio đúng engine
  const radio = $(`input[name="engine"][value="${s.translationApi || "mymemory"}"]`);
  if (radio) radio.checked = true;
  syncDeeplGroup();

  // Điền key (hiển thị dạng ẩn)
  $("#deepl-key").value = s.deeplKey || "";
  $("#deepl-status").textContent = "";
  $("#deepl-status").className = "deepl-status";

  // Link đăng ký
  $("#deepl-link").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: DEEPL_SIGNUP }); };
}

function syncDeeplGroup() {
  const engine = $("input[name='engine']:checked")?.value;
  $("#deepl-key-group").classList.toggle("disabled", engine !== "deepl");
}

$$("input[name='engine']").forEach((r) => r.addEventListener("change", syncDeeplGroup));

// Hiện/ẩn key
$("#toggle-key-vis").onclick = () => {
  const inp = $("#deepl-key");
  inp.type = inp.type === "password" ? "text" : "password";
};

// Test & lưu
$("#save-settings").onclick = async () => {
  const engine = $("input[name='engine']:checked")?.value || "mymemory";
  const key = $("#deepl-key").value.trim();

  if (engine === "deepl") {
    if (!key) {
      showDeeplStatus("Vui lòng nhập API key.", "err");
      return;
    }
    // Kiểm tra key hợp lệ bằng cách gọi thử
    showDeeplStatus("Đang kiểm tra key…", "");
    const ok = await testDeeplKey(key);
    if (!ok) {
      showDeeplStatus("Key không hợp lệ hoặc hết quota. Kiểm tra lại.", "err");
      return;
    }
    showDeeplStatus("Key hợp lệ ✓", "ok");
  }

  await setSettings({
    translationApi: engine,
    deeplKey: key,
    highlightEnabled: $("#highlight-enabled").checked,
  });
  // Xoá cache cũ để dịch lại với engine mới
  await chrome.storage.local.remove("translationCache");

  $("#settings-saved").classList.remove("hidden");
  setTimeout(() => $("#settings-saved").classList.add("hidden"), 2000);
};

$("#clear-cache").onclick = async () => {
  await chrome.storage.local.remove("translationCache");
  toast2("Đã xoá cache dịch ✓");
};

async function testDeeplKey(key) {
  try {
    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: { "Authorization": "DeepL-Auth-Key " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: ["Hello"], source_lang: "EN", target_lang: "VI" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function showDeeplStatus(msg, type) {
  const el = $("#deepl-status");
  el.textContent = msg;
  el.className = "deepl-status" + (type ? " " + type : "");
}

function toast2(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:8px 16px;border-radius:999px;font-size:13px;z-index:999";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ---------- Helpers ----------
function speak(word) {
  if (!word) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  speechSynthesis.speak(u);
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

loadWords();
