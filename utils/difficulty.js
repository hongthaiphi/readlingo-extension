// Phát hiện "từ khó": từ KHÔNG nằm trong danh sách common-words được coi là khó.
// Chạy 100% offline, không gọi API.

let COMMON = null;

async function loadCommon() {
  if (COMMON) return COMMON;
  const url = chrome.runtime.getURL("data/common-words.json");
  const res = await fetch(url);
  const data = await res.json();
  COMMON = new Set(data.words.map((w) => w.toLowerCase()));
  return COMMON;
}

// Lemmatize đơn giản: đưa từ về dạng gốc gần đúng để tra cứu.
export function lemmatize(word) {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ied") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && w.length > 4) {
    const base = w.slice(0, -2);
    if (/(s|x|z|ch|sh)$/.test(base)) return base;
  }
  if (w.endsWith("ing") && w.length > 5) {
    let base = w.slice(0, -3);
    // running -> run (bỏ phụ âm đôi cuối)
    if (/([bcdfghjklmnpqrstvwxz])\1$/.test(base)) base = base.slice(0, -1);
    else if (/[^aeiou]$/.test(base) && base.length >= 3) {
      // có thể là make-ing -> mak -> make
    }
    return base;
  }
  if (w.endsWith("ed") && w.length > 4) {
    let base = w.slice(0, -2);
    if (/([bcdfghjklmnpqrstvwxz])\1$/.test(base)) base = base.slice(0, -1);
    return base;
  }
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

// Trả về true nếu là từ khó nên highlight.
// knownSet: Set các từ (lowercase) người dùng đã đánh dấu known/đã lưu.
function isHard(common, raw, knownSet) {
  const clean = raw.replace(/[^A-Za-z'-]/g, "");
  if (clean.length < 3) return false;
  // Bỏ qua tên riêng / từ viết hoa (heuristic): nếu chữ đầu hoa.
  if (/^[A-Z]/.test(raw)) return false;
  const lower = clean.toLowerCase();
  if (knownSet && knownSet.has(lower)) return false;
  if (common.has(lower)) return false;
  if (common.has(lemmatize(lower))) return false;
  return true;
}

// Phân tích 1 câu -> mảng token { text, hard }.
// Giữ nguyên dấu câu/khoảng trắng để render lại đúng câu gốc.
export async function tokenizeSentence(sentence, knownWords = []) {
  const common = await loadCommon();
  const knownSet = new Set(knownWords.map((w) => w.toLowerCase()));
  const tokens = [];
  // Tách giữ delimiter: chữ-từ vs phần còn lại.
  const parts = sentence.split(/([A-Za-z][A-Za-z'-]*)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const isWord = /^[A-Za-z][A-Za-z'-]*$/.test(part);
    if (isWord) {
      tokens.push({ text: part, hard: isHard(common, part, knownSet) });
    } else {
      tokens.push({ text: part, hard: false });
    }
  }
  return tokens;
}
