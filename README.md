# ReadLingo – Bilingual Reader

> Free Chrome extension for learning English by reading any website with side-by-side translation (English ↔ Vietnamese). A free alternative to Language Reactor's web reader feature.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Tính năng / Features

| | |
|---|---|
| 📖 **Đọc song ngữ** | Chuột phải vào bất kỳ trang web tiếng Anh → mở giao diện đọc 2 cột (EN trái, VI phải), căn chỉnh từng câu |
| 🔵 **Highlight từ khó** | Từ không nằm trong ~800 từ phổ biến nhất được tô màu tự động |
| 💬 **Popup tra từ** | Di chuột vào từ → hiện IPA, nghĩa tiếng Việt, nút "Thêm vào danh sách học" |
| 🔊 **TTS tự động** | Bấm ▶ bên cạnh câu bất kỳ → máy đọc to toàn bộ đoạn sau đó lần lượt |
| 🗂 **Danh sách từ vựng** | Lưu từ kèm câu ví dụ + URL nguồn vào `chrome.storage.local` |
| 🃏 **Flashcard ôn tập** | Spaced repetition SM-2 (giống Anki): 3 mức Không nhớ / Khó nhớ / Dễ nhớ, hiển thị interval trước khi chọn |
| 📊 **Thống kê** | Streak học, tổng từ, nguồn lưu nhiều nhất |
| 🌐 **Dịch miễn phí** | MyMemory (mặc định, không cần key) hoặc DeepL Free (cần API key, chất lượng cao hơn) |

---

## Cài đặt (Load unpacked)

> Chưa có trên Chrome Web Store — cài thủ công:

1. Download hoặc clone repo này
2. Mở Chrome → địa chỉ `chrome://extensions`
3. Bật **Developer mode** (góc phải trên)
4. Bấm **Load unpacked** → chọn thư mục `extension/`
5. Extension xuất hiện trên thanh công cụ

---

## Cách dùng

1. Mở bất kỳ trang web tiếng Anh
2. Chuột phải vào vùng văn bản → chọn **"Read in ReadLingo"**
3. Giao diện đọc song ngữ mở ra trong tab mới
4. Di chuột vào từ được highlight (màu tím) → popup tra từ hiện ra
5. Bấm **"Thêm vào danh sách học"** để lưu từ
6. Bấm icon extension để xem danh sách từ, ôn flashcard, xem thống kê

---

## Cài DeepL (tuỳ chọn, chất lượng dịch cao hơn)

1. Đăng ký tài khoản miễn phí tại [deepl.com/pro-api](https://www.deepl.com/pro-api) → lấy API key (1 triệu ký tự miễn phí)
2. Bấm icon extension → tab ⚙ → chọn **DeepL Free** → dán key → **Lưu cài đặt**

---

## Cấu trúc thư mục

```
extension/
├── manifest.json
├── icons/                  # PNG icons 16/48/128px
├── background/
│   └── service-worker.js   # Context menu handler, message router
├── content/
│   └── extractor.js        # Trích xuất văn bản từ trang web
├── reader/
│   ├── reader.html         # Giao diện đọc song ngữ
│   ├── reader.js           # Logic hiển thị, TTS, popup tra từ
│   └── reader.css
├── popup/
│   ├── popup.html          # UI popup (4 tab)
│   ├── popup.js            # Từ vựng, flashcard, stats, settings
│   └── popup.css
├── utils/
│   ├── segment.js          # Tách câu (xử lý Dr., U.S., v.v.)
│   ├── difficulty.js       # Phát hiện từ khó (offline, common-words)
│   ├── translate.js        # MyMemory + DeepL, chunk 4 câu, cache
│   ├── srs.js              # Thuật toán SM-2 (Anki-style)
│   ├── storage.js          # chrome.storage wrapper
│   └── dictionary.js       # dictionaryapi.dev → IPA + nghĩa
└── data/
    └── common-words.json   # ~800 từ phổ biến nhất tiếng Anh
```

---

## Tech stack

- **Chrome Extension Manifest V3** — ES modules, service worker
- **Dịch**: [MyMemory API](https://mymemory.translated.net/) (miễn phí) + [DeepL Free API](https://www.deepl.com/pro-api)
- **Từ điển**: [dictionaryapi.dev](https://dictionaryapi.dev/) (miễn phí, không cần key)
- **TTS**: Web Speech API (built-in trình duyệt)
- **Spaced repetition**: SM-2 algorithm
- **Storage**: `chrome.storage.local` (toàn bộ dữ liệu lưu trên máy người dùng)

---

## Privacy

Toàn bộ dữ liệu (từ vựng, cài đặt, cache dịch) được lưu **trực tiếp trên máy bạn** qua `chrome.storage.local`. Extension không có server, không thu thập dữ liệu người dùng.

Câu văn bản được gửi đến API dịch bên thứ ba (MyMemory hoặc DeepL) để dịch — xem [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

---

## License

MIT © 2025
