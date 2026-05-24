// Wrapper quanh chrome.storage.local cho vocabulary, cache dịch, settings, stats.

const DEFAULT_SETTINGS = {
  difficultyThreshold: "B2",
  showTranslationByDefault: true,
  translationApi: "mymemory", // "mymemory" | "deepl"
  deeplKey: "",               // DeepL Free API key (https://www.deepl.com/pro-api)
  theme: "auto",
  dailyGoal: 10,
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getVocabulary() {
  const { vocabulary } = await chrome.storage.local.get("vocabulary");
  return vocabulary || [];
}

export async function findWord(word) {
  const vocab = await getVocabulary();
  const key = word.trim().toLowerCase();
  return vocab.find((v) => v.word.toLowerCase() === key) || null;
}

export async function saveWord(entry) {
  const vocab = await getVocabulary();
  const key = entry.word.trim().toLowerCase();
  const existing = vocab.find((v) => v.word.toLowerCase() === key);
  if (existing) return { saved: false, entry: existing };

  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    word: entry.word.trim(),
    ipa: entry.ipa || "",
    pos: entry.pos || "",
    meanings: entry.meanings || [],
    example: entry.example || "",
    sourceUrl: entry.sourceUrl || "",
    sourceName: entry.sourceName || "",
    savedAt: now.toISOString(),
    status: "new",
    // SM-2 fields
    interval: 0,
    repetitions: 0,
    ef: 2.5,
    lastReviewedAt: null,
    nextReviewAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
  };
  vocab.push(record);
  await chrome.storage.local.set({ vocabulary: vocab });
  await bumpStreak();
  return { saved: true, entry: record };
}

export async function updateWord(id, patch) {
  const vocab = await getVocabulary();
  const idx = vocab.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  vocab[idx] = { ...vocab[idx], ...patch };
  await chrome.storage.local.set({ vocabulary: vocab });
  return vocab[idx];
}

export async function deleteWord(id) {
  const vocab = await getVocabulary();
  const next = vocab.filter((v) => v.id !== id);
  await chrome.storage.local.set({ vocabulary: next });
}

// Đánh dấu 1 từ là "known" theo text (dùng khi bấm "Đã biết" trong reader).
export async function markKnown(word) {
  const vocab = await getVocabulary();
  const key = word.trim().toLowerCase();
  const existing = vocab.find((v) => v.word.toLowerCase() === key);
  if (existing) {
    existing.status = "known";
  } else {
    vocab.push({
      id: crypto.randomUUID(),
      word: word.trim(),
      ipa: "", pos: "", meanings: [], example: "",
      sourceUrl: "", sourceName: "",
      savedAt: new Date().toISOString(),
      status: "known",
      lastReviewedAt: null,
      nextReviewAt: null,
    });
  }
  await chrome.storage.local.set({ vocabulary: vocab });
}

// ---- Translation cache ----
export async function getCachedTranslations(hashes) {
  const { translationCache } = await chrome.storage.local.get("translationCache");
  const cache = translationCache || {};
  const result = {};
  for (const h of hashes) if (cache[h] != null) result[h] = cache[h];
  return result;
}

export async function putCachedTranslations(map) {
  const { translationCache } = await chrome.storage.local.get("translationCache");
  const cache = translationCache || {};
  Object.assign(cache, map);
  await chrome.storage.local.set({ translationCache: cache });
}

// ---- Reading history ----
export async function addHistory(item) {
  const { readingHistory } = await chrome.storage.local.get("readingHistory");
  const list = readingHistory || [];
  const filtered = list.filter((h) => h.url !== item.url);
  filtered.unshift({ ...item, readAt: new Date().toISOString() });
  await chrome.storage.local.set({ readingHistory: filtered.slice(0, 50) });
}

export async function getHistory() {
  const { readingHistory } = await chrome.storage.local.get("readingHistory");
  return readingHistory || [];
}

// ---- Stats / streak ----
export async function getStats() {
  const { stats } = await chrome.storage.local.get("stats");
  return stats || { streakDays: 0, lastActiveDate: null };
}

export async function bumpStreak() {
  const stats = await getStats();
  const today = new Date().toISOString().slice(0, 10);
  if (stats.lastActiveDate === today) return stats;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  stats.streakDays = stats.lastActiveDate === yesterday ? (stats.streakDays || 0) + 1 : 1;
  stats.lastActiveDate = today;
  await chrome.storage.local.set({ stats });
  return stats;
}
