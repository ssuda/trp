

/**
 * Uses Puppeteer and the browser's online/offline events to monitor internet
 * connection status.
 */

const util = require('util');
const dns = require('dns');

async function isConnected() {
  try {
    const lookupService = util.promisify(dns.lookupService);
    const result = await lookupService('8.8.8.8', 53);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = async function(page) {

  page.on('online', () => {
      console.info('Online!') ;
      page.reload();
  });
  page.on('offline', () => console.info('Offline!'));

    try {
        // Adds window.connectionChange in page.
        await page.exposeFunction('connectionChange', async online => {
            // Since online/offline events aren't 100% reliable, do an
            // actual dns lookup to verify connectivity.
            const isReallyConnected = await isConnected();
            page.emit(isReallyConnected ? 'online' : 'offline');
        });
    } catch (ex) { }

  // Monitor browser online/offline events in the page.
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('online', e => window.connectionChange(navigator.onLine));
    window.addEventListener('offline', e => window.connectionChange(navigator.onLine));
  });
}