# Privacy Policy — ReadLingo

_Last updated: 2025-05-24_

## Summary

ReadLingo does **not** collect, transmit, or store any personal data on external servers. All user data stays on your device.

---

## Data stored locally (on your device only)

ReadLingo uses `chrome.storage.local` to store:

| Data | Purpose |
|---|---|
| Saved vocabulary words | Show in word list, use in flashcard review |
| Translation cache | Avoid re-translating the same sentences |
| App settings (translation engine, API key) | Remember your preferences |
| Learning stats (streak, review history) | Show progress in Stats tab |

This data is stored **only on your computer** and is never sent to ReadLingo's servers (ReadLingo has no servers).

---

## Data sent to third-party APIs

To provide translation and dictionary features, ReadLingo sends text to the following third-party services:

### Translation

- **MyMemory** (`api.mymemory.translated.net`) — English sentences you read are sent for translation to Vietnamese. No account required. See [MyMemory Privacy Policy](https://mymemory.translated.net/doc/privacy.php).
- **DeepL Free API** (`api-free.deepl.com`) — Only if you choose DeepL in Settings and enter your own API key. Text is sent to DeepL's servers. See [DeepL Privacy Policy](https://www.deepl.com/en/privacy).

### Dictionary lookup

- **dictionaryapi.dev** (`api.dictionaryapi.dev`) — The word you hover over is sent to fetch its IPA pronunciation and English definition. This is a free, open-source API with no account tracking.

**Only the text content of the page you are reading is sent — never your name, email, browsing history, or any personal information.**

---

## Permissions used

| Permission | Why it's needed |
|---|---|
| `contextMenus` | Add "Read in ReadLingo" to the right-click menu |
| `activeTab` | Extract text from the current tab when you trigger the context menu |
| `scripting` | Run the content extractor on the active tab |
| `storage` | Save vocabulary and settings to your device |

---

## Contact

This is an open-source project. If you have questions, open an issue on GitHub.
