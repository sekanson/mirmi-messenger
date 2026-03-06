/* -- Mirmi Messenger v2 - background.js (MV3 Service Worker) --- */
/* Relays fetch requests from content scripts to bypass CORS      */
/* Handles image upload relay                                     */

const BRIDGE_URL = 'https://mirmi-bridge.sekanson.com';
const API_KEY    = 'mirmi-dev-key-2026';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Mirmi Messenger v2 installed.');
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

    return true; // keep channel open for async sendResponse
  }

  if (msg.type === 'uploadImage') {
    const { dataUrl, fileName } = msg;

    fetch(BRIDGE_URL + '/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mirmi-key': API_KEY
      },
      body: JSON.stringify({ dataUrl, fileName })
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
