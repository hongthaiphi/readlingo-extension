// Tách văn bản tiếng Anh thành từng câu, xử lý các viết tắt thường gặp.

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc",
  "ltd", "co", "corp", "dept", "est", "fig", "gen", "gov", "rep", "sen",
  "no", "vol", "pp", "al", "ed", "eg", "ie", "approx", "appt", "apt",
  "i.e", "e.g", "u.s", "u.k", "a.m", "p.m", "ph.d", "b.a", "m.a",
]);

// Trả về mảng câu (đã trim, bỏ rỗng).
export function splitSentences(text) {
  if (!text) return [];
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = [];
  let current = "";

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    current += ch;

    if (ch === "." || ch === "!" || ch === "?") {
      // Gộp các dấu kết thúc liên tiếp + dấu ngoặc/nháy đóng.
      while (i + 1 < normalized.length && /[.!?"')\]]/.test(normalized[i + 1])) {
        current += normalized[++i];
      }

      const next = normalized[i + 1];
      const nextNext = normalized[i + 2];

      // Phải có khoảng trắng sau dấu kết thúc.
      if (next !== undefined && next !== " ") continue;

      // Câu tiếp theo nên bắt đầu bằng chữ hoa hoặc số.
      if (nextNext !== undefined && !/[A-Z0-9"'(]/.test(nextNext)) continue;

      // Kiểm tra viết tắt: lấy "từ" ngay trước dấu chấm.
      if (ch === ".") {
        const m = current.match(/([A-Za-z.]+)\.$/);
        if (m) {
          const wordBefore = m[1].replace(/\.$/, "").toLowerCase();
          if (ABBREVIATIONS.has(wordBefore)) continue;
          // Chữ cái đơn viết tắt: "A." "B." -> không tách.
          if (wordBefore.length === 1) continue;
        }
      }

      sentences.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

// Tách 1 mảng đoạn văn thành mảng câu phẳng, giữ thứ tự.
export function paragraphsToSentences(paragraphs) {
  const out = [];
  for (const p of paragraphs) {
    const sents = splitSentences(p);
    for (const s of sents) out.push(s);
  }
  return out;
}
