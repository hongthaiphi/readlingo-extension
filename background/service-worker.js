import { extractArticle } from "../content/extractor.js";

const MENU_ID = "readlingo-read";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Read in ReadLingo",
    contexts: ["page", "selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  await openReader(tab.id);
});

async function openReader(tabId) {
  let payload;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractArticle,
    });
    payload = result;
  } catch (e) {
    payload = { error: "Không đọc được nội dung trang này: " + e.message };
  }

  const id = "doc_" + Date.now().toString(36);
  await chrome.storage.session.set({ [id]: payload });

  await chrome.tabs.create({
    url: chrome.runtime.getURL("reader/reader.html") + "?id=" + id,
  });
}
