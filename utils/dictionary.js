// Tra nghĩa/IPA/audio của 1 từ đơn qua dictionaryapi.dev (free, EN->EN)
// + dịch nghĩa tiếng Việt qua translate.js.
import { translateSentences } from "./translate.js";

export async function lookupWord(word) {
  const clean = word.trim().toLowerCase();
  const out = { word: clean, ipa: "", pos: "", audio: "", defs: [], meaningsVi: [] };

  try {
    const res = await fetch(
      "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(clean)
    );
    if (res.ok) {
      const data = await res.json();
      const entry = data[0];
      if (entry) {
        const ph = (entry.phonetics || []).find((p) => p.text);
        out.ipa = entry.phonetic || ph?.text || "";
        const aud = (entry.phonetics || []).find((p) => p.audio);
        out.audio = aud?.audio || "";
        const m0 = entry.meanings?.[0];
        out.pos = m0?.partOfSpeech || "";
        out.defs = (m0?.definitions || []).slice(0, 2).map((d) => d.definition);
      }
    }
  } catch {
    /* bỏ qua, vẫn cố dịch nghĩa */
  }

  // Dịch nghĩa tiếng Việt: dịch chính từ đó (và definition đầu nếu có).
  try {
    const [viWord] = await translateSentences([clean]);
    if (viWord && viWord.toLowerCase() !== clean) out.meaningsVi.push(viWord);
  } catch {
    /* ignore */
  }

  return out;
}
