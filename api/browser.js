const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
const findChrome = require('chrome-finder');
const fs = require('fs');
const crypto = require('crypto');

const vision = require('./captch-browser'); //require('./vision'); //require('../src/rekognition');
const { getEmbeddedChromiumPath } = require('./chromium');
const { delay, promiseAny, promiseWithTimeout } = require('./utils');

function browserArgs(headless) {
  const result = [
    '--disable-features=ScriptStreaming',
    '--auto-detect=false',
    //'--no-proxy-server',
    '--enable-blink-features=HTMLImports',
    '--proxy-server="direct://"',
    '--proxy-bypass-list=*',
    '--ignore-certificate-errors',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-cloud-import',
    '--enable-gpu-rasterization',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-gesture-typing',
    '--disable-hang-monitor',
    '--disable-infobars',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-offer-upload-credit-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--disable-tab-for-desktop-share',
    '--disable-translate',
    '--disable-voice-input',
    '--disable-wake-on-wifi',
    '--enable-async-dns',
    '--enable-simple-cache-backend',
    '--enable-tcp-fast-open',
    '--disable-web-security',
    '--enable-webgl',
    //'--auto-open-devtools-for-tabs',
    '--hide-scrollbars',
    '--disable-features=site-per-process',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--prerender-from-omnibox=disabled',
    // '--use-gl=swiftshader',
    '--enable-lazy-image-loading',
    '--enable-quic',
    '--use-mock-keychain',
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-component-update',
    '--disable-component-extensions-with-background-pages',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--js-flags=--random-seed=1157259157',
    '--enable-automation',
    '--disable-device-discovery-notifications',
    '--disk-cache-size=33554432',
    '--ignore-gpu-blacklist',
    '--disable-default-apps',
    '--no-default-browser-check',
    '--use-fake-device-for-media-stream',
    '--allow-running-insecure-content',
    '--disable-web-security'
    // '--disable-gl-drawing-for-tests', // BEST OPTION EVER! Disables GL drawing operations which produce pixel output. With this the GL output will not be correct but tests will run faster.
  ];

  if (headless === true) {
    result.push('--single-process');
  } else {
    result.push('--start-maximized');
  }

  return result;
}

function browserLaunchTimeout() {
  const configured = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 10000) {
    return Math.min(configured, 120000);
  }
  return 60000;
}

function defaultViewport(headless) {
  if (headless !== true) {
    return null;
  }

  return {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: 1080,
    isLandscape: true,
    isMobile: false,
    width: 1920
  };
}

module.exports = function(tabNo) {
  let log = (...args) => console.log('Tab', tabNo, ...args);
  let error = (...args) => console.error('Tab', tabNo, ...args);

  if (tabNo === undefined) {
    tabNo = 'Main';
  }
  let browser;
  let page;
  let mainUrl;
  let globalDisconnectHandler;
  let credentials;
  let globalHeadless;
  let captchaImage;

  function getExecutablePath() {
    const embeddedChromium = getEmbeddedChromiumPath();
    if (embeddedChromium) {
      log('Found embedded Chromium at:', embeddedChromium);
      return embeddedChromium;
    }

    try {
      const defaultPath = puppeteer.executablePath();
      if (fs.existsSync(defaultPath)) {
        log('Found default Puppeteer Chromium at:', defaultPath);
        return defaultPath;
      }
    } catch (e) {}

    if (process.platform === 'win32') {
      throw new Error(
        'Compatible embedded Chromium is missing. Reinstall the application.'
      );
    }

    try {
      const systemChrome = findChrome();
      if (systemChrome && fs.existsSync(systemChrome)) {
        log('Found system Chrome at:', systemChrome);
        return systemChrome;
      }
    } catch (e) {}

    return undefined;
  }

  async function browserInstance(headless) {
    if (!browser) {
      const execPath = getExecutablePath();
      log('Launching browser with executablePath:', execPath);

      const launchedBrowser = await puppeteer.launch({
        dumpio: false,
        headless,
        ignoreHTTPSErrors: true,
        waitForInitialPage: false,
        executablePath: execPath,
        args: browserArgs(headless),
        defaultViewport: defaultViewport(headless),
        timeout: browserLaunchTimeout()
      });
      browser = launchedBrowser;
      launchedBrowser.on('error', ex => {
        error('Browser process error:', ex && ex.message ? ex.message : ex);
      });
      launchedBrowser.on('disconnected', () =>
        disconnectHandler(launchedBrowser)
      );
    }
  }

  function disconnectHandler(disconnectedBrowser) {
    if (browser && disconnectedBrowser && browser !== disconnectedBrowser) {
      return;
    }
    browser = null;
    page = null;
    if (globalDisconnectHandler) {
      globalDisconnectHandler();
    }
  }

  async function pageInstance(forceNewPage = false, browserContext) {
    credentials || (credentials = {});

    if (forceNewPage) {
      page = browserContext
        ? await browserContext.newPage()
        : await browser.newPage();
    } else {
      const pages = await browser.pages();
      if (pages.length) {
        page = pages[0];
      } else {
        page = await browser.newPage();
      }
    }

    page.on('dialog', async dialog => {
      try {
        await dialog.accept();
      } catch (ex) {}
    });

    page.on('response', async response => {
      const url = response.url();
      const type = response.request().resourceType();
      const method = response.request().method();
      try {
        if (
          type == 'document' &&
          method == 'GET' &&
          url.includes('/i3msnew1.aspx')
        ) {
          log('calling login from page response');
          await login();
        } else if (
          method == 'GET' &&
          url.toLowerCase().includes('/captcha.aspx') &&
          response.request().resourceType() === 'image'
        ) {
          captchaImage = await response.buffer();
        }
      } catch (ex) {
        log(method, url);
        error(ex);
      }
    });

    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(30000);
    const userAgent = (await browser.userAgent()).replace(
      /HeadlessChrome/i,
      'Chrome'
    );
    await page.setUserAgent(userAgent);
    await page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => false
        });
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'visible'
        });
        document.hasFocus = () => true;
      } catch (ex) {
        // Older Chromium builds may expose these properties as non-configurable.
      }
    });
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.enable');
      await client
        .send('Network.setBlockedURLs', { urls: ['*verisign.com*'] })
        .catch(() => {});
      await client.send('Page.enable');
      await client
        .send('Page.setWebLifecycleState', { state: 'active' })
        .catch(() => {});
      await client
        .send('Emulation.setFocusEmulationEnabled', { enabled: true })
        .catch(() => {});
    } catch (ex) {
      log('Unable to force page active state:', ex.message);
    }
    // await page.addScriptTag({
    //   content:
    // })
  }

  function fill(selector, v) {
    return page.$eval(selector, (el, v) => (el.value = v), v);
  }

  async function selectOption(selector, number) {
    const sel = `${selector} > option:nth-child(${number})`;
    await page.waitForSelector(sel);

    const val = await page.$eval(sel, el => el.value);
    await page.select(selector, val);
  }

  async function clickHelper(selector, timeout = 60000, waitFor = null) {
    await page.waitForSelector(selector, {
      timeout: Math.min(timeout, 30000)
    });
    await page.evaluate(selector => {
      const el = document.querySelector(selector);
      if (!el) {
        throw new Error(`Unable to find ${selector}`);
      }
      el.click();
    }, selector);

    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout });
    }
  }

  function setRadioButton(selector) {
    return page.evaluate(selector => {
      document.querySelector(selector).checked = true;
    }, selector);
  }

  async function gridData(selector, timeout) {
    await page.waitForSelector(selector, timeout ? { timeout } : undefined);
    const rows = await page.$$eval(`${selector} tr`, trs =>
      trs.map(tr => tr.innerText)
    );

    // Map each row on its own; flattening all cells before chunking by 3
    // misaligned every key/value pair whenever a row has more than 3 cells.
    return rows.reduce((data, row) => {
      if (row.includes('\n')) {
        return data;
      }
      const cells = row.split('\t').filter(cell => cell.trim());
      if (cells.length >= 3) {
        data[cells[0]] = cells[2].toUpperCase();
      }
      return data;
    }, {});
  }

  async function tableData(selector, txtField) {
    await page.waitForSelector(selector);
    return await page.$$eval(
      `${selector} tr`,
      (trs, txtField) => {
        let first_row = true;
        const headers = [];
        const rows = [];
        trs.forEach(tr => {
          if (first_row) {
            first_row = false;
            const ths = tr.querySelectorAll('th');
            ths.forEach(td => {
              headers.push(td.innerText.replace(/\*/, '').trim());
            });
          } else {
            const tds = tr.querySelectorAll('td');
            const obj = {};
            let i = 0;

            tds.forEach(td => {
              let a = td.querySelector(
                'input[type="checkbox"],input[type="text"]'
              );
              if (a) {
                if (headers[i]) {
                  obj[headers[i]] = a.id;
                } else {
                  obj.select_box = a.id;
                }
              } else {
                a = td.querySelector('a');
                obj[headers[i]] = a ? a.href : td.innerText.trim();

                if (a) {
                  obj[headers[i] + ' Text'] = a.innerText.trim();
                }
              }
              i++;
            });
            rows.push(obj);
          }
        });
        return rows;
      },
      txtField
    );
  }

  async function gotoPage(href, allowLogin = true, maxAttempts = 2) {
    if (!browser || !page || !href) {
      throw new Error('Browser, page, or destination URL is unavailable');
    }

    href = decodeURI(href);
    let referer = await page.url();
    let lastError;

    mainUrl = href;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!browser || !page) {
          throw new Error('Browser disconnected during navigation');
        }
        await page.goto(href, {
          referer,
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        if (
          allowLogin &&
          /\/(i3msnew1|Default)\.aspx/i.test(page.url())
        ) {
          log('Session expired while loading page; waiting for login');
          await login();
        }
        return true;
      } catch (ex) {
        lastError = ex;
        error(
          `Navigation attempt ${attempt}/${maxAttempts} failed:`,
          ex.message
        );
        if (!browser || !page) {
          break;
        }
        if (attempt < maxAttempts) {
          await delay(2000);
        }
      }
    }

    throw new Error(
      `Unable to load i3ms page after ${maxAttempts} attempts: ${
        (lastError && lastError.message) || href
      }`
    );
  }

  function generateUID(length) {
    const buf = crypto.randomBytes(length * 2);
    return buf
      .toString('hex')
      .replace(/[+/]/g, '')
      .substring(0, length);
  }

  let loginPromise;

  async function performLogin() {
    if (!page || !credentials || !credentials.username || !credentials.password) {
      throw new Error('i3ms login credentials are unavailable');
    }

    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (!page) {
          throw new Error('Browser page is unavailable during login');
        }

        const today = new Date();
        const date =
          today.getFullYear() +
          '-' +
          (today.getMonth() + 1) +
          '-' +
          today.getDate();
        const time =
          today.getHours() + ':' + today.getMinutes() + ':' + today.getSeconds();
        const dateTime = date + ' ' + time;

        const no = generateUID(256);
        const string = '09' + no + '/' + dateTime;
        const encodedString = Buffer.from(string).toString('base64');
        const loginUrl =
          'https://i3ms.odishaminerals.gov.in/Default.aspx?id=' + encodedString;

        log('Logging into', loginUrl, `attempt ${attempt}/3`);

        await page.goto(loginUrl, {
          referer: 'https://i3ms.odishaminerals.gov.in/i3msnew1.aspx',
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await page.waitForSelector('#btnSubmit', { timeout: 20000 });
        await fill('#txtusr', credentials.username);
        await fill('#txtpwd', credentials.password);

        await Promise.all([
          page
            .waitForNavigation({
              waitUntil: 'domcontentloaded',
              timeout: 30000
            })
            .catch(() => null),
          page.click('#btnSubmit')
        ]);

        const message = await page
          .$eval('#lblMsg', el => el.innerText)
          .catch(() => '');

        if (/password is incorrect/i.test(message)) {
          throw new Error('i3ms password is incorrect');
        }

        const currentUrl = page.url();
        if (/\/Default\.aspx/i.test(currentUrl)) {
          throw new Error(message || 'i3ms login timed out');
        }

        log('Logged in');
        if (mainUrl && page && mainUrl !== loginUrl) {
          log('Returning to', mainUrl);
          await gotoPage(mainUrl, false);
        }
        return true;
      } catch (ex) {
        lastError = ex;
        error(`Login attempt ${attempt}/3 failed:`, ex.message);
        if (/password is incorrect/i.test(ex.message)) {
          throw ex;
        }
        // Retry immediately: the next attempt starts with a fresh goto, which
        // is all the reset a transient failure needs.
      }
    }

    throw new Error(
      `Unable to log in to i3ms after 3 attempts: ${
        (lastError && lastError.message) || 'unknown error'
      }`
    );
  }

  function login() {
    if (!loginPromise) {
      loginPromise = performLogin().finally(() => {
        loginPromise = null;
      });
    }
    return loginPromise;
  }

  async function gotoTagPage(href) {
    if (!href) {
      throw new Error('Tagging URL is unavailable');
    }
    try {
      href = decodeURIComponent(href);
    } catch (ex) {
      // Keep the raw href when it is not properly encoded.
    }
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await gotoPage(href, true, 1);
        const r = await gridData('#grTrAction', 30000);
        const v = await page
          .$eval('#lbtn_count', el => el.innerText)
          .catch(() => '');
        const taggedCount = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
        if (Number.isFinite(taggedCount)) {
          r.tagged = taggedCount;
        }
        return r;
      } catch (ex) {
        lastError = ex;
        error(`Tag page attempt ${attempt}/2 failed:`, ex.message);
        if (attempt < 2) {
          await delay(2000);
        }
      }
    }

    throw new Error(
      `Unable to open tagging page: ${
        (lastError && lastError.message) || 'unknown error'
      }`
    );
  }

  async function waitForCaptchaImage(timeoutMs = 10000) {
    const startTime = Date.now();
    const hasBufferedImage = () => captchaImage && captchaImage !== 'Error';

    // Fast path: the response interceptor usually captures the captcha bytes
    // right after the image is requested.
    while (Date.now() - startTime < 1500) {
      if (hasBufferedImage()) {
        return captchaImage;
      }
      await delay(25);
    }

    // Fallback: wait in-page until the captcha element finishes loading, then
    // capture it with a single element screenshot. Polling inside the page
    // avoids a Node <-> browser round-trip on every check.
    const remaining = timeoutMs - (Date.now() - startTime);
    if (remaining <= 0 || !pageReady()) {
      return captchaImage;
    }

    const selector =
      'img[src*="captcha.aspx" i], input[type="image"][src*="captcha.aspx" i]';
    try {
      await page.waitForFunction(
        sel => {
          const el = document.querySelector(sel);
          return (
            !!el &&
            (!('complete' in el) || (el.complete && el.naturalWidth > 0))
          );
        },
        { polling: 200, timeout: remaining },
        selector
      );

      if (hasBufferedImage()) {
        return captchaImage;
      }

      const element = await page.$(selector);
      if (element) {
        return await element.screenshot({ type: 'png' });
      }
    } catch (ex) {
      log('Unable to capture captcha element:', ex.message);
    }

    return captchaImage;
  }

  function recoverableTaggingMessage(message) {
    return /(something(?: went)? wrong)|(in\s*correct captcha)|(captcha.{0,60}(invalid|wrong|recognition|ocr|parse|empty|image|number|operator|readable|required))|(execution context)|(target closed)|(session closed)|(page.{0,20}closed)|(network)|(navigation)|(timeout)|(timed out)|(detached)|(\berror\b)/i.test(
      message || ''
    );
  }

  function pageReady() {
    return Boolean(
      browser &&
        (typeof browser.isConnected !== 'function' || browser.isConnected()) &&
        page &&
        (typeof page.isClosed !== 'function' || !page.isClosed())
    );
  }

  async function waitForTagSearchResult(timeout = 30000) {
    const result = await page.waitForFunction(
      () => {
        const vts = document.querySelector('#Rdo_VTS_0');
        if (vts && !vts.hasAttribute('data-spinbi-stale')) return 'vts';

        const message = document.querySelector('#lblMsg');
        if (
          message &&
          message.textContent.trim() &&
          (!message.hasAttribute('data-spinbi-stale') ||
            message.textContent.trim() !== message.dataset.spinbiPreviousText)
        ) {
          return 'message';
        }

        const validation = document.querySelector('#lblVehicleVldInfo');
        if (
          validation &&
          validation.textContent.trim() &&
          (!validation.hasAttribute('data-spinbi-stale') ||
            validation.textContent.trim() !==
              validation.dataset.spinbiPreviousText)
        ) {
          return 'validation';
        }

        return false;
      },
      { polling: 100, timeout }
    );

    return result.jsonValue();
  }

  async function waitForTagSubmitResult(
    truckNo,
    previousTaggedCount,
    timeout = 30000
  ) {
    const result = await page.waitForFunction(
      (expectedTruck, taggedCountBeforeSubmit) => {
        const message = document.querySelector('#lblMsg');
        if (
          message &&
          message.textContent.trim() &&
          (!message.hasAttribute('data-spinbi-stale') ||
            message.textContent.trim() !== message.dataset.spinbiPreviousText)
        ) {
          return 'message';
        }

        const taggedCount = document.querySelector('#lbtn_count');
        if (taggedCountBeforeSubmit !== null && taggedCount) {
          const countText = taggedCount.textContent.replace(/[^0-9]/g, '');
          const currentTaggedCount = countText ? Number(countText) : null;
          if (
            Number.isFinite(currentTaggedCount) &&
            currentTaggedCount > taggedCountBeforeSubmit
          ) {
            return 'count';
          }
        }

        const vehicle = document.querySelector('#txtVehicleNo');
        if (
          vehicle &&
          vehicle.value.trim().toUpperCase() !==
            String(expectedTruck)
              .trim()
              .toUpperCase()
        ) {
          return 'reset';
        }

        return false;
      },
      { polling: 100, timeout },
      truckNo,
      previousTaggedCount
    );

    return result.jsonValue();
  }

  async function markTagResultsStale(selectors) {
    await page.evaluate(selectors => {
      selectors.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
          element.dataset.spinbiPreviousText = element.textContent.trim();
          element.dataset.spinbiPreviousValue = element.value || '';
          element.setAttribute('data-spinbi-stale', 'true');
        }
      });
    }, selectors);
  }

  async function readPermitName(options) {
    try {
      return await page.$eval('#grTrAction .valueBlack', el =>
        el ? el.innerText : ''
      );
    } catch (e) {
      return (options && options.name) || '';
    }
  }

  async function tagVehicle(truckNo, renderer, options) {
    let reason = '';
    let permitName = '';
    let submitAttempted = false;
    let submitOutcomeKnown = false;

    try {
      log('before waiting for txtVehicleNo');

      captchaImage = 'Error';

      await page.waitForSelector('#txtVehicleNo', { timeout: 30000 });

      permitName = await readPermitName(options);

      log('permitName', permitName);

      await page.$eval(
        '#txtVehicleNo',
        (el, truckNo) => {
          el.disabled = false;
          el.value = truckNo;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        truckNo
      );

      log('before btnsearch');
      // Search can immediately request captcha.aspx, so clearing the cached
      // image must happen before the postback starts.
      captchaImage = 'Error';
      await markTagResultsStale([
        '#Rdo_VTS_0',
        '#lblMsg',
        '#lblVehicleVldInfo'
      ]);
      await clickHelper('#btnsearch', 120000);

      const searchResult = await waitForTagSearchResult();

      log('after btnsearch', searchResult);

      if (searchResult === 'vts') {
        {
          await clickHelper('#rdo_GPS_0');
          await clickHelper('#Rdo_VTS_0');

          log('before waiting for SIM');
          await clickHelper('#Rdo_SIM_0');

          try {
            await page.waitForSelector('#chkClick', { timeout: 10000 });
            await page.click('#chkClick');
          } catch (e) {
            log('chkClick wait/click skipped:', e.message);
          }

          const validCaptchaImage = await waitForCaptchaImage(10000);

          if (!validCaptchaImage || validCaptchaImage === 'Error') {
            throw new Error('Captcha image could not be loaded');
          }

          let captchaVal = await promiseWithTimeout(
            vision(validCaptchaImage, renderer),
            30000
          );
          if (
            captchaVal === null ||
            captchaVal === undefined ||
            !String(captchaVal).trim()
          ) {
            throw new Error('Captcha recognition returned an empty value');
          }
          log('captchaVal', captchaVal);
          await page.$eval(
            '#txtcaptcha',
            (e, val) => (e.value = val),
            captchaVal
          );
          log('before btnsubmit');
          const previousTaggedCount = await page
            .$eval('#lbtn_count', el => {
              const countText = el.textContent.replace(/[^0-9]/g, '');
              const value = countText ? Number(countText) : null;
              return Number.isFinite(value) ? value : null;
            })
            .catch(() => null);
          await markTagResultsStale(['#lblMsg', '#txtVehicleNo']);
          submitAttempted = true;
          await clickHelper('#btnSubmit', 120000);
          const submitResult = await waitForTagSubmitResult(
            truckNo,
            previousTaggedCount
          );
          submitOutcomeKnown = true;
          log('after btnsubmit', submitResult);

          reason = await page
            .$eval('#lblMsg', el => (el ? el.innerText : ''))
            .catch(() => '');
          if (recoverableTaggingMessage(reason)) {
            throw new Error(reason);
          }
          if (!reason && !['reset', 'count'].includes(submitResult)) {
            throw new Error('Tagging result could not be confirmed');
          }
        }
      } else if (searchResult === 'validation') {
        reason = await page
          .$eval('#lblVehicleVldInfo', el => (el ? el.innerText : ''))
          .catch(() => '');
        log('vehicle', truckNo, reason);
      } else {
        reason = await page
          .$eval('#lblMsg', el => (el ? el.innerText : ''))
          .catch(() => '');
        if (!reason) {
          reason = await page
            .$eval('#lblVehicleVldInfo', el => (el ? el.innerText : ''))
            .catch(() => '');
        }

        if (recoverableTaggingMessage(reason)) {
          throw new Error(reason);
        }
      }

      return { reason, name: (permitName || '').trim() };
    } catch (ex) {
      let url = '';
      try {
        url = page ? page.url() : '';
      } catch (urlError) {
        url = '';
      }
      error(ex.message, url);

      if (submitAttempted && !submitOutcomeKnown) {
        ex.tagSubmissionOutcomeUnknown = true;
      }

      if (
        !pageReady() ||
        !url.includes('TransporterAssignVehicleNew.aspx') ||
        recoverableTaggingMessage(ex.message)
      ) {
        throw ex;
      }

      permitName = await readPermitName(options);

      return {
        reason: ex.message || 'Tagging failed',
        name: (permitName || '').trim()
      };
    }
  }

  async function releasePage(href, permitNo, trucks) {
    let numberOfOptions = 3;
    let option = 2;
    let failures = 0;
    let lastError;

    while (option <= numberOfOptions && failures < 2) {
      try {
        await gotoPage(href, true, 1);

        await page.waitForSelector('#ddlTransporter', { timeout: 30000 });

        numberOfOptions = await page.$$eval(
          '#ddlTransporter option',
          options => options.length
        );

        await selectOption('#ddlTransporter', option);

        if (permitNo[0] == 'L') {
          await page.select('#ddlPermitType', '1');
        } else {
          await page.select('#ddlPermitType', '2');
        }
        await fill('#txtPermitNo', permitNo);
        await clickHelper('#btnGetVehicle');

        console.log('waiting for  1stFrom');
        await page.waitForSelector('#lstFrom', { timeout: 30000 });
        let r = await page.$eval('#lstFrom', el => {
          const arr = [];

          for (let i = 0; i < el.options.length; ++i) {
            arr.push(el.options[i].value);
          }

          return arr;
        });

        if (!r.length && option < numberOfOptions) {
          option++;
        } else {
          if (trucks) {
            for (let truckNo of trucks) {
              await page.select('#lstFrom', truckNo);
              await page.click('#btnAdd');
            }

            if (await page.$('#btnRelease')) {
              await page.click('#btnRelease');
            }
            r = _.difference(r, trucks);
          }
          return r;
        }
      } catch (ex) {
        lastError = ex;
        failures++;
        error(ex);
        if (!browser || !page) {
          break;
        }
        if (failures < 2) {
          await delay(2000);
        }
      }
    }

    throw new Error(
      `Unable to read the tagged vehicle list: ${
        (lastError && lastError.message) || 'no transporter data found'
      }`
    );
  }

  function permitDataFromTable(selector) {
    selector || (selector = '#grTrAction');
    return gridData(selector);
  }

  async function permitDetails(href, selector) {
    try {
      await gotoPage(href);
      return permitDataFromTable(selector);
    } catch (ex) {
      //retry
      await gotoPage(href);
      return permitDataFromTable(selector);
    }
  }

  async function openAll(selector) {
    await page.waitForSelector(selector);
    const text = await page.$eval(selector, el => el.innerText);
    if (!/paging/i.test(text)) {
      await page.click(selector);
      await page.waitForFunction('!document.querySelector(".paging")', {
        polling: 100
      });
    }
  }

  async function permitsInfo(permits, sse) {
    const out = [];

    for (let permit of permits) {

      if (/javascript/i.test(permit['Permit No.']) || !permit['Permit No.']) {
        continue;
      }

      const createdAt = moment(
        permit['Request On'] || permit['Requested On'],
        'DD MMM YYYY'
      );

      const startDate = createdAt.local().format('YYYY-MM-DD');
      createdAt.add(1, 'month');
      const endDate = createdAt.local().format('YYYY-MM-DD');

      let pr = {
        name: permit['Permit No.'],
        startDate: startDate,
        endDate: endDate,
        circle: permit['Circle'],
        taggingUrl: permit['Tag New Vehicle'],
        source: permit['Lessee/Licensee Name'].replace(/-\d+/, ''),
        vehicleDetails: permit['Vehicle Details']
      };


      if (!pr.taggingUrl) {
        const uri = new URL(pr.vehicleDetails);
        pr.taggingUrl =
          'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
          uri.search;
      }

      out.push(pr);
    }

    sse.send('new-permits', out);
  }

  async function lastTwoMonthPermits(
    href,
    selector,
    previousMonth,
    onlyNewPermits,
    sse
  ) {
    console.log('last two month permits called');
    await gotoPage(href);

    do {
      selector || (selector = '#grdTransporterActions');

      let submitButton = await promiseAny(
        page.waitForSelector('#btnsubmit'),
        page.waitForSelector('#btnSubmit')
      );

      await page.waitForSelector(selector);

      const el = await page.$(selector);
      let rows = [];
      if (el) {
        if (!onlyNewPermits) {
          const r = await promiseAny(
            page.waitForXPath(
              '//*[@id="grdTransporterActions"]/tbody/tr/td[contains(text(), "No Record(s) Found")]'
            ),
            openAll('#btnAll')
          );

          console.log('last two month permits after waiting', r);

          if (r === 2) {
            await delay(5000);
            rows = await tableData(selector);
            console.log('last two month permits', rows);
          }
        } else {
          rows = await tableData(selector);
        }
      }

      if (previousMonth) {
        await page.waitForSelector('#ddlMonth');
        const dt = moment().subtract(1, 'month');
        const month = dt.month() + 1;
        const year = dt.year();

        await page.select('#ddlMonth', '' + month);
        await page.select('#ddlYear', '' + year);
        await page.click(submitButton == 1 ? '#btnsubmit' : '#btnSubmit');

        await openAll('#btnAll');
        await delay(5000);

        let data = await tableData(selector);
        rows = rows.concat(data || []);
      }

      if (sse) {
        //sse.send('new-permits', rows);
        await permitsInfo(rows, sse);
        await page.reload();
      } else {
        return rows;
      }

      await delay(5000);
    } while (sse);
  }

  async function gotoPermitTripsPage(href) {
    await gotoPage(href);
  }

  async function permitVehicles(href, permitNo, fromdate, todate) {
    if (href) {
      await gotoPage(href);
    }
    await page.waitForSelector('#txtpermit');

    fromdate ||
      (fromdate = moment()
        .subtract(1, 'day')
        .format('DD-MMM-YYYY'));
    todate || (todate = moment().format('DD-MMM-YYYY'));

    let r = 3;

    while (r == 3) {
      try {
        await fill('#txtpermit', permitNo);

        await fill('#frm_txt_date', fromdate);

        await fill('#to_txt_date', todate);

        await Promise.all([
          page.waitForNavigation({
            timeout: 120000,
            waitUntil: 'networkidle0'
          }),
          page.click('#btnsearch')
        ]);

        try {
          r = await promiseAny(
            page.waitForXPath(
              '//*[@id="grdpermitwise"]/tbody/tr/td[contains(text(), "Total")]'
            ),
            page.waitForXPath(
              '//*[@id="grdpermitwise"]/tbody/tr/td[contains(text(), "No Record")]'
            ),
            page.waitForXPath(
              '//*[@id="lblMsg"][contains(text(), "Something went wrong")]'
            )
          );

          if (r == 2) {
            return {
              trucks: []
            };
          }
        } catch (ex) {
          error(ex);
          return {
            trucks: []
          };
        }
      } catch (ex) {
        error(ex);
      }

      const result = await gridData('#tabdata');

      result.trucks = await tableData('#grdpermitwise');

      return result;
    }

    return {
      trucks: []
    };
  }

  async function disconnect() {
    if (browser) {
      const closingBrowser = browser;
      browser = null;
      page = null;
      try {
        await promiseWithTimeout(closingBrowser.close(), 15000);
      } catch (ex) {
        error('Browser close timed out; terminating process:', ex.message);
        const browserProcess = closingBrowser.process();
        if (browserProcess && !browserProcess.killed) {
          browserProcess.kill();
        }
      }
    } else {
      return Promise.resolve();
    }
  }

  // Reload the current page so an idle logged-in session stays warm. If the
  // session already expired, the response interceptor logs back in during the
  // reload. A dead page/connection drops the browser so the pool rebuilds it.
  async function keepAlivePage() {
    if (!pageReady()) {
      throw new Error('Tagging page is unavailable');
    }
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      return true;
    } catch (ex) {
      error('Keep-alive reload failed:', ex.message);
      await disconnect();
      throw ex;
    }
  }

  async function openBrowser(headless) {
    console.log('open browser is called');
    if (globalHeadless != headless) {
      await disconnect();
      globalHeadless = headless;
    }

    await browserInstance(headless);
    await pageInstance();
  }

  async function companyName() {
    try {
      const el = await page.$('.welcome');

      if (el) {
        return page.$eval('.welcome', el =>
          el.childNodes[0].textContent
            .trim()
            .replace(/^Wel *come/i, '')
            .trim()
        );
      }
      return '';
    } catch (ex) {
      return '';
    }
  }

  async function initializeBrowser(cred, headless, tologin, cb, returnCompany) {
    console.log('initializeBrowser called');
    if (cred) {
      credentials = cred;
    }

    if (cb) {
      globalDisconnectHandler = cb;
    }

    await openBrowser(headless);

    if (tologin) {
      await login();
    }

    if (returnCompany) {
      return companyName();
    }
  }

  function getBrowser() {
    return browser;
  }

  function getPage() {
    return page;
  }

  return {
    getBrowser,
    getPage,
    companyName,
    initializeBrowser,
    login,
    permitVehicles,
    gotoPermitTripsPage,
    lastTwoMonthPermits,
    permitDetails,
    releasePage,
    tagVehicle,
    gotoTagPage,
    disconnect,
    openBrowser,
    keepAlivePage
  };
};
