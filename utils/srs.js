// Thuật toán SM-2 (giống Anki).
// Mỗi từ có 3 trường: interval (ngày), repetitions (lần đúng liên tiếp), ef (ease factor).

const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const HARD_FACTOR = 1.2;   // Anki: Hard = interval × 1.2
const EASY_BONUS  = 1.3;   // Anki: Easy = Good × 1.3

// quality: 1 = không nhớ, 3 = khó nhớ, 5 = dễ nhớ
function sm2(card, quality) {
  let { interval = 0, repetitions = 0, ef = DEFAULT_EF } = card;

  if (quality >= 3) {
    let next;
    if (repetitions === 0) {
      // Lần đầu: Hard=1d, Easy=4d
      next = quality === 5 ? 4 : 1;
    } else if (repetitions === 1) {
      // Lần 2: Hard=6d, Easy=10d
      next = quality === 5 ? 10 : 6;
    } else {
      // Lần 3+: Hard × 1.2, Easy × EF × 1.3 (khác nhau rõ ràng)
      const hard = Math.max(interval + 1, Math.round(interval * HARD_FACTOR));
      const easy = Math.max(hard + 1,     Math.round(interval * ef * EASY_BONUS));
      next = quality === 3 ? hard : easy;
    }
    interval = next;
    repetitions += 1;
    // EF: Hard giảm, Easy tăng
    ef += quality === 3 ? -0.15 : 0.1;
  } else {
    // Quên → reset
    repetitions = 0;
    interval = 1;
    ef -= 0.2;
  }

  ef = Math.max(MIN_EF, parseFloat(ef.toFixed(4)));
  return { interval, repetitions, ef };
}

// Xác định status dựa trên SM-2 state
function toStatus(repetitions, interval) {
  if (repetitions === 0) return "new";
  if (interval < 21)     return "learning";
  return "known";
}

// Áp dụng 1 kết quả review vào entry, trả về entry mới.
export function applyReview(entry, quality) {
  const { interval, repetitions, ef } = sm2(entry, quality);
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + interval * 86400000).toISOString();
  const status = toStatus(repetitions, interval);
  return { ...entry, interval, repetitions, ef, status, lastReviewedAt: now.toISOString(), nextReviewAt };
}

// Xem trước interval của mỗi nút mà không thay đổi entry.
// Trả về { again, hard, easy } — số ngày đến lần ôn tiếp theo.
export function previewIntervals(entry) {
  return {
    again: sm2(entry, 1).interval,
    hard:  sm2(entry, 3).interval,
    easy:  sm2(entry, 5).interval,
  };
}

// Lọc từ đến hạn ôn (kể cả "known"), sắp xếp: new → learning → known.
export function dueForReview(vocab, now = new Date()) {
  const ts = now.getTime();
  const rank = { new: 0, learning: 1, known: 2 };
  return vocab
    .filter((v) => v.nextReviewAt && new Date(v.nextReviewAt).getTime() <= ts)
    .sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1));
}

// Tính ngày ôn tiếp theo (dùng khi lưu từ mới)
export function nextReviewDate(status, from = new Date()) {
  const days = { new: 1, learning: 3, known: 7 }[status] ?? 1;
  return new Date(from.getTime() + days * 86400000).toISOString();
}
