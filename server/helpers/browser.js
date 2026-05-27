// Shared Puppeteer browser singleton — one Chromium for all PDF requests.
// Launching Chromium per-request is the slow/wasteful pattern (~1-2s, ~150MB);
// keeping one alive and spawning lightweight pages (~10MB each) is the right one.
const puppeteer = require('puppeteer');

let browser = null;
let launching = null;

async function getBrowser() {
  // Puppeteer v22+ exposes `connected` as a property (was `isConnected()` before)
  if (browser && browser.connected) return browser;
  if (launching) return launching;

  console.log('[puppeteer] launching Chromium...');
  launching = puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  }).then((b) => {
    browser = b;
    launching = null;
    b.on('disconnected', () => { browser = null; });
    console.log('[puppeteer] Chromium ready');
    return b;
  }).catch((err) => {
    launching = null;
    throw err;
  });
  return launching;
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}

// Graceful shutdown so dev restarts don't leak Chrome processes
['SIGINT', 'SIGTERM'].forEach((sig) => process.once(sig, async () => {
  await closeBrowser();
  process.exit(0);
}));

module.exports = { getBrowser, closeBrowser };
