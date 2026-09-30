const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
//const findChrome = require('chrome-finder');
const crypto = require('crypto');

const vision = require('./captch-browser'); //require('./vision'); //require('../src/rekognition');
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

function defaultViewport(headless) {
  return {
    deviceScaleFactor: 1,
    hasTouch: false,
    height: headless === true ? 1080 : 0,
    isLandscape: true,
    isMobile: false,
    width: headless === true ? 1920 : 0
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

  async function browserInstance(headless) {
    // const browserFetcher = puppeteer.createBrowserFetcher();
    // const localChromiums = await browserFetcher.localRevisions();

    // if (!localChromiums.length) {
    //   return console.error('Can\'t find installed Chromium');
    // }

    // const { executablePath } = await browserFetcher.revisionInfo(localChromiums[0]);

    headless =
      process.env.SHOW_BROWSER !== undefined
        ? !JSON.parse(process.env.SHOW_BROWSER.toLowerCase())
        : headless;

    if (!browser) {
      browser = await puppeteer.launch({
        dumpio: false,
        //product: 'firefox',
        headless,
        ignoreHTTPSErrors: true,
        waitForInitialPage: false,
        //ignoreDefaultArgs: true,
        args: browserArgs(headless),
        //  args: [
        //   '--auto-detect=false',
        //  "--no-proxy-server",
        // '--disable-extensions',
        //   '--no-sandbox',
        //   '--disable-setuid-sandbox',
        //  ],
        //executablePath: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', //findChrome(),
        //executablePath,//findChrome(),
        defaultViewport: defaultViewport(headless),
        timeout: 60000
      });
      browser.on('error', ex => {
        error('Browser error:', ex.message);
        if (page && !page.isClosed()) {
          page
            .reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(reloadError =>
              error('Browser reload failed:', reloadError.message)
            );
        }
      });
      browser.on('disconnected', disconnectHandler);
    }
  }

  function disconnectHandler(e) {
    browser = null;
    page = null;
    if (globalDisconnectHandler) {
      globalDisconnectHandler();
    }
  }

  async function pageInstance() {
    credentials || (credentials = {});

    const pages = await browser.pages();

    if (pages.length) {
      page = pages[0];
    } else {
      page = await browser.newPage();
    }

    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.enable');
      await client.send('Network.setBlockedURLs', {
        urls: ['*verisign.com*']
      });
    } catch (ex) {
      error('Failed to configure CDP blocked URLs:', ex.message);
    }

    page.on('dialog', async dialog => {
      try {
        await dialog.accept().catch(() => {});
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

    page.setDefaultTimeout(120000);
    //page.setDefaultNavigationTimeout(120000);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
    );
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
    await page.waitForSelector(selector, { timeout: Math.min(timeout, 30000) });
    await page.evaluate(selector => {
      const el = document.querySelector(selector);
      if (el) el.click();
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

  async function gridData(selector, options) {
    await page.waitForSelector(selector, options);
    let rows = await page.$$eval(`${selector} tr`, trs => {
      return trs.map(tr => tr.innerText);
    });

    rows = rows.filter(row => !row.includes('\n'));
    rows = rows
      .map(row => row.split('\t').filter(t => t.trim()))
      .filter(r => r.length >= 3);
    rows = _.flatMap(rows);
    rows = _.chunk(rows, 3);
    return _.reduce(
      rows,
      (p, row) => {
        p[row[0]] = row[2].toUpperCase();
        return p;
      },
      {}
    );
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

  async function gotoPage(href, maxAttempts = 2) {
    if (!browser || !page || !href) {
      throw new Error('Browser, page, or destination URL is unavailable');
    }

    try {
      href = decodeURI(href);
    } catch (ex) {
      // Keep the original URL when it is not correctly encoded.
    }
    const referer = await page.url();
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

        if (/\/(i3msnew1|Default)\.aspx/i.test(page.url())) {
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
      `Unable to load i3ms page after ${maxAttempts} attempts: ${(lastError &&
        lastError.message) ||
        href}`
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
    if (
      !page ||
      !credentials ||
      !credentials.username ||
      !credentials.password
    ) {
      throw new Error('i3ms login credentials are unavailable');
    }

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const today = new Date();
        const date =
          today.getFullYear() +
          '-' +
          (today.getMonth() + 1) +
          '-' +
          today.getDate();
        const time =
          today.getHours() +
          ':' +
          today.getMinutes() +
          ':' +
          today.getSeconds();
        const no = generateUID(256);
        const encodedString = Buffer.from(
          '09' + no + '/' + date + ' ' + time
        ).toString('base64');
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

        const dashboardResponse = page
          .waitForResponse(
            response => response.url().includes('/Dashboard_TR.aspx'),
            { timeout: 30000 }
          )
          .then(() => true)
          .catch(() => false);

        await page.click('#btnSubmit');
        const reachedDashboard = await dashboardResponse;
        const message = await page
          .$eval('#lblMsg', el => el.innerText)
          .catch(() => '');

        if (/password is incorrect/i.test(message)) {
          throw new Error('i3ms password is incorrect');
        }
        if (
          !reachedDashboard &&
          /\/(i3msnew1|Default)\.aspx/i.test(page.url())
        ) {
          throw new Error(message || 'i3ms login timed out');
        }

        log('loggedin');
        if (mainUrl && mainUrl !== loginUrl) {
          log('Going to url', mainUrl);
          await page.goto(mainUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
        }
        return true;
      } catch (ex) {
        lastError = ex;
        error(`Login attempt ${attempt}/3 failed:`, ex.message);
        if (/password is incorrect/i.test(ex.message)) {
          throw ex;
        }
      }
    }

    throw new Error(
      `Unable to log in to i3ms after 3 attempts: ${(lastError &&
        lastError.message) ||
        'unknown error'}`
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
      // Keep the original URL when it is not correctly encoded.
    }
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await gotoPage(href, 1);
        const r = await gridData('#grTrAction', { timeout: 30000 });
        await page.waitForSelector('#txtVehicleNo', { timeout: 30000 });
        const v = await page
          .$eval('#lbtn_count', el => el.innerText)
          .catch(() => '');
        if (v) {
          const tagged = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
          if (Number.isFinite(tagged)) {
            r.tagged = tagged;
          }
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
      `Unable to open tagging page: ${(lastError && lastError.message) ||
        'unknown error'}`
    );
  }

  async function waitForCaptchaImage(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (captchaImage && captchaImage !== 'Error') {
        return true;
      }
      await delay(100);
    }
    return false;
  }

  async function markTagResultsStale(selectors) {
    await page.evaluate(selectors => {
      selectors.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
          element.dataset.spinbiPreviousText = element.textContent.trim();
          element.setAttribute('data-spinbi-stale', 'true');
        }
      });
    }, selectors);
  }

  async function waitForTagSearchResult() {
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
      { polling: 100, timeout: 30000 }
    );

    return result.jsonValue();
  }

  async function waitForTagSubmitResult(truckNo, previousTaggedCount) {
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
      { polling: 100, timeout: 45000 },
      truckNo,
      previousTaggedCount
    );

    return result.jsonValue();
  }

  async function tagVehicle(href, truckNo, renderer, options, attempt = 0) {
    let reason = '';
    try {
      log('before waiting for txtVehicleNo');

      captchaImage = 'Error';

      await page.waitForSelector('#txtVehicleNo', { timeout: 30000 });

      let permitName = await page
        .$eval('#grTrAction .valueBlack', el => el.innerText)
        .catch(() => options.name || '');

      options.name = permitName;
      console.log('permitname', permitName);

      await page.$eval(
        '#txtVehicleNo',
        (el, truckNo) => {
          el.disabled = false;
          el.value = truckNo;
        },
        truckNo
      );

      log('before btnsearch');
      await markTagResultsStale([
        '#Rdo_VTS_0',
        '#lblMsg',
        '#lblVehicleVldInfo'
      ]);
      await clickHelper('#btnsearch', 120000);

      const searchResult = await waitForTagSearchResult();

      log('after btnsearch', searchResult);

      if (searchResult === 'vts') {
        await clickHelper('#rdo_GPS_0');
        await clickHelper('#Rdo_VTS_0');
        log('before waiting for SIM');
        await clickHelper('#Rdo_SIM_0');

        await page.click('#chkClick');
        const gotCaptcha = await waitForCaptchaImage(6000);
        if (!gotCaptcha) {
          log('Loading captcha image error, reloading page');
          if (attempt < 2) {
            await gotoTagPage(href);
            return tagVehicle(href, truckNo, renderer, options, attempt + 1);
          }
          return {
            reason: 'Loading captcha image timed out',
            name: (permitName || '').trim()
          };
        }

        let captchaVal = await promiseWithTimeout(
          vision(captchaImage, renderer),
          20000
        );
        if (!captchaVal) {
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
        await markTagResultsStale(['#lblMsg']);
        await page.evaluate(() => {
          const btn = document.querySelector('#btnSubmit');
          if (btn) btn.click();
        });

        const submitResult = await waitForTagSubmitResult(
          truckNo,
          previousTaggedCount
        );
        log('after btnsubmit', submitResult);

        reason = await page
          .$eval('#lblMsg', el => el.innerText)
          .catch(() => '');
        if (
          /(something wrong)|(in correct captcha)|(error)|(timeout)/i.test(
            reason
          )
        ) {
          if (attempt < 2) {
            await gotoTagPage(href);
            return tagVehicle(href, truckNo, renderer, options, attempt + 1);
          }
        }
      } else {
        reason = await page
          .$eval('#lblVehicleVldInfo', el => el.innerText)
          .catch(() => '');
        if (!reason) {
          reason = await page
            .$eval('#lblMsg', el => el.innerText)
            .catch(() => '');
        }

        if (
          /(something wrong)|(in correct captcha)|(error)|(timeout)/i.test(
            reason
          )
        ) {
          if (attempt < 2) {
            await gotoTagPage(href);
            return tagVehicle(href, truckNo, renderer, options, attempt + 1);
          }
        }
      }

      return { reason, name: (permitName || '').trim() };
    } catch (ex) {
      let url = page ? page.url() : '';
      error(ex.message, url);
      if (attempt < 2) {
        await gotoTagPage(href);
        return tagVehicle(href, truckNo, renderer, options, attempt + 1);
      }

      let permitName = options.name || '';
      return { reason: ex.message || false, name: permitName };
    }
  }

  async function releasePage(href, permitNo, trucks) {
    let numberOfOptions = 3;
    let option = 2;

    while (option <= numberOfOptions) {
      try {
        await gotoPage(href);

        await page.waitForSelector('#ddlTransporter');

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
        await page.waitForSelector('#lstFrom');
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
        error(ex);
        if (!browser || !page) {
          break;
        }
        await gotoPage(href);
      }
    }
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
      await page.waitForFunction('!document.querySelector(".paging")');
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
      await browser.close();
      browser = null;
      page = null;
    } else {
      return Promise.resolve();
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
    permitVehicles,
    gotoPermitTripsPage,
    lastTwoMonthPermits,
    permitDetails,
    releasePage,
    tagVehicle,
    gotoTagPage,
    disconnect,
    openBrowser
  };
};
