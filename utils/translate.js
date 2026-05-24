// Dịch câu EN->VI. Hỗ trợ DeepL Free và MyMemory.
import { getCachedTranslations, putCachedTranslations, getSettings } from "./storage.js";

const CHUNK_SIZE = 4;
// MyMemory separator (newline-only, reliable split)
const SEP = "\n||||\n";

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return "s" + (h >>> 0).toString(36);
}

// ---------- DeepL Free ----------
async function translateDeepL(texts, key) {
  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      "Authorization": "DeepL-Auth-Key " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texts, source_lang: "EN", target_lang: "VI" }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.status);
    throw new Error("deepl " + res.status + ": " + msg);
  }
  const data = await res.json();
  return (data.translations || []).map((t) => t.text);
}

// ---------- MyMemory (free, không cần key, 5000 chars/ngày) ----------
async function translateMyMemory(text) {
  const url =
    "https://api.mymemory.translated.net/get?langpair=en|vi&q=" +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error("mymemory " + res.status);
  const data = await res.json();
  // responseStatus 429 = quota exceeded
  if (data.responseStatus && data.responseStatus !== 200) {
    throw new Error("mymemory status " + data.responseStatus);
  }
  return data?.responseData?.translatedText || "";
}

// Gộp nhiều câu thành 1 request MyMemory để tiết kiệm quota
async function translateMyMemoryBatch(texts) {
  const joined = texts.join(SEP);
  // MyMemory giới hạn 500 chars/request khi gộp — nếu dài thì dịch riêng
  if (joined.length > 450) {
    return Promise.all(texts.map((t) => translateMyMemory(t).catch(() => "")));
  }
  const translated = await translateMyMemory(joined);
  const parts = translated.split(SEP).map((s) => s.trim());
  if (parts.length === texts.length) return parts;
  // Tách không khớp → dịch từng câu
  return Promise.all(texts.map((t) => translateMyMemory(t).catch(() => "")));
}

// ---------- Chunk translator ----------
async function translateChunk(texts, api, deeplKey) {
  // DeepL: batch native, chất lượng cao nhất
  if (api === "deepl" && deeplKey) {
    try {
      const results = await translateDeepL(texts, deeplKey);
      if (results.length === texts.length) return results;
    } catch (e) {
      console.warn("DeepL error, fallback to MyMemory:", e.message);
    }
  }

  // MyMemory: free default
  try {
    return await translateMyMemoryBatch(texts);
  } catch (e) {
    console.warn("MyMemory error:", e.message);
    return texts.map(() => "");
  }
}

// ---------- Public API ----------
export async function translateSentences(sentences, onProgress) {
  const settings = await getSettings();
  const api = settings.translationApi || "mymemory";
  const deeplKey = settings.deeplKey || "";

  const hashes = sentences.map(hash);
  const cached = await getCachedTranslations(hashes);
  const results = new Array(sentences.length).fill(null);
  const needFetch = [];

  sentences.forEach((_, i) => {
    const h = hashes[i];
    if (cached[h] != null) {
      results[i] = cached[h];
      onProgress?.(i, cached[h]);
    } else {
      needFetch.push(i);
    }
  });

  if (!needFetch.length) return results;

  const groups = [];
  for (let i = 0; i < needFetch.length; i += CHUNK_SIZE) {
    groups.push(needFetch.slice(i, i + CHUNK_SIZE));
  }

  const newCache = {};
  const CONCURRENCY = api === "deepl" ? 2 : 2;
  let cursor = 0;

  async function worker() {
    while (cursor < groups.length) {
      const group = groups[cursor++];
      const texts = group.map((idx) => sentences[idx]);
      const translations = await translateChunk(texts, api, deeplKey);
      group.forEach((idx, j) => {
        const vi = translations[j] || "";
        results[idx] = vi;
        newCache[hashes[idx]] = vi;
        onProgress?.(idx, vi);
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (Object.keys(newCache).length) await putCachedTranslations(newCache);
  return results;
}
