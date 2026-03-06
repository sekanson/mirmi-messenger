/* ── Mirmi Messenger - background.js (MV3 Service Worker) ── */
/* Relays fetch requests from content scripts to bypass CORS  */

const BRIDGE_URL = 'https://mirmi-bridge.sekanson.com';
const API_KEY    = 'mirmi-dev-key-2026';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Mirmi Messenger installed.');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'bridgeFetch') {
    const url = BRIDGE_URL + msg.path;
    const opts = {
      method: msg.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-mirmi-key': API_KEY
      }
    };
    if (msg.body) opts.body = JSON.stringify(msg.body);

    fetch(url, opts)
      .then(async (res) => {
        if (!res.ok) throw new Error('Bridge error: ' + res.status);
        const data = await res.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  if (msg.type === 'uploadImage') {
    const url = BRIDGE_URL + '/api/upload-image';
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mirmi-key': API_KEY
      },
      body: JSON.stringify({
        dataUrl: msg.dataUrl,
        fileName: msg.fileName
      })
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Upload error: ' + res.status);
        const data = await res.json();
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  return false;
});
