const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment');
const findChrome = require('chrome-finder');

const { delay, promiseAny } = require('./utils');

function browserArgs(headless) {
  const result = [
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-cloud-import',
    '--disable-default-apps',
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
    '--enable-webgl',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--prerender-from-omnibox=disabled',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-backgrounding-occluded-windows',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--disk-cache-size=33554432',
    '--ignore-gpu-blacklist'
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

module.exports = function() {
  // Globals
  let browser;
  let page;
  let mainUrl;
  let globalDisconnectHandler;

  async function browserInstance(headless) {
    headless =
      process.env.SHOW_BROWSER == undefined ? true : !process.env.SHOW_BROWSER;

    if (!browser) {
      browser = await puppeteer.launch({
        headless,
        args: browserArgs(headless),
        executablePath: findChrome(),
        defaultViewport: defaultViewport(headless),
        timeout: 0
      });
      browser.on('error', () => page.reload());
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

    const t = await browser.pages();
    page = t[0];

    page.on('dialog', async dialog => {
      try {
        await dialog.accept();
      } catch (ex) {
        // console.error(ex);
      }
    });

    page.on('response', async response => {
      const url = response.url();
      const type = response.request().resourceType();
      const method = response.request().method();

      if (
        type == 'document' &&
        method == 'GET' &&
        url.includes('/i3msnew1.aspx')
      ) {
        await login();
      }
    });

    //page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
  }

  // utility functions
  function fill(selector, v) {
    return page.$eval(selector, (el, v) => (el.value = v), v);
  }

  async function selectOption(selector, number) {
    const sel = `${selector} > option:nth-child(${number})`;
    await page.waitForSelector(sel);

    const val = await page.$eval(sel, el => el.value);
    await page.select(selector, val);
  }

  async function gotoPage(href) {
    if (!browser || !page) {
      return;
    }
    let numAttempts = 1;
    let success = true;

    mainUrl = href;

    while (numAttempts < 80) {
      try {
        if (!browser || !page) {
          success = false;
          break;
        }
        await page.goto(href, { waitUntil: 'networkidle2' });
        success = true;
        break;
      } catch (ex) {
        console.error(ex);
        if (!browser || !page || /net::ERR_/i.test(ex.message)) {
          success = false;
          break;
        }
        await delay(5000);
        numAttempts++;
        await page.reload();
        success = false;
      }
    }

    return success;
  }

  async function login() {
    try {
      if (!page) {
        return;
      }

      await page.goto('https://i3ms.orissaminerals.gov.in/Default.aspx?id=1');
      await page.waitForSelector('#btnSubmit');
      await fill('#txtusr', credentials.username);
      await fill('#txtpwd', credentials.password);
      await page.click('#btnSubmit');
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      await delay(2000);
      if (mainUrl) {
        await page.goto(mainUrl, { waitUntil: 'networkidle2' });
      }
    } catch (ex) {
      console.error(ex);
      login();
    }
  }

  async function gotoTagPage(href) {
    let retries = 0;

    while (retries < 3) {
      await gotoPage(href);
      try {
        const r = await gridData('#grTrAction');
        const v = await page.$eval('#lbtn_count', el => el.innerText);
        if (v) {
          r.tagged = +v;
        }
        return r;
      } catch (ex) {
        if (!/timeout/i.test(ex.message)) {
          break;
        }
        retries++;
      }
    }
  }

  async function tagVehicle(href, truckNo) {
    let reason = '';
    try {
      await page.waitForSelector('#txtVehicleNo', { timeout: 30000 });
      await page.$eval(
        '#txtVehicleNo',
        (el, truckNo) => {
          el.disabled = false;
          el.value = truckNo;
        },
        truckNo
      );

      await navigationClickHelper('#btnsearch');

      const r = await promiseAny(
        page.waitForSelector('#rdo_GPS_0', { timeout: 30000 }),
        page.waitForSelector('#lblMsg')
      );

      if (r == 1) {
        await setRadioButton('#rdo_GPS_0');
        await setRadioButton('#Rdo_VTS_0');
        await navigationClickHelper('#Rdo_SIM_0');
        await page.click('#chkClick');
        await navigationClickHelper('#btnSubmit');
        await delay(100);
      } else {
        reason = page.$eval('#lblMsg', el => el.innerText);

        if (/something wrong/i.test(reason)) {
          return tagVehicle(href, truckNo);
        }
      }

      return reason;
    } catch (ex) {
      console.error(ex);
      if (/(execution context)|(network|timeout)/i.test(ex.message)) {
        await gotoTagPage(href);
        return tagVehicle(href, truckNo);
      }
      return false;
    }
  }

  async function navigationClickHelper(selector, timeout = 30000) {
    return Promise.all([
      page.waitForNavigation({ timeout }),
      page.click(selector)
    ]);
  }

  async function setRadioButton(selector) {
    return page.evaluate(selector => {
      document.querySelector(selector).checked = true;
    }, selector);
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
        const [response] = await Promise.all([
          page.waitForNavigation(), // The promise resolves after navigation has finished
          page.click('#btnGetVehicle') // Clicking the link will indirectly cause a navigation
        ]);

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
        console.error(ex);
        if (!browser || !page) {
          break;
        }
        await gotoPage(href);
      }
    }
  }

  async function gridData(selector) {
    await page.waitForSelector(selector);
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

  async function getPermitDetails(href, selector) {
    await gotoPage(href);
    selector || (selector = '#grTrAction');
    const result = await gridData(selector);
    return result;
  }

  async function openAll(selector) {
    await page.waitForSelector(selector);
    const text = await page.$eval(selector, el => el.innerText);
    if (!/paging/i.test(text)) {
      await page.click(selector);
      await page.waitForFunction('!document.querySelector(".paging")');
    }
  }

  async function transportAssignVehicles(href) {
    await gotoPage(href);
    return gridData('#grTrAction table');
  }

  async function getNewPermits() {
    await gotoPage(
      'https://i3ms.orissaminerals.gov.in/i3ms/pms/NewRequestTransporter.aspx'
    );
    const selector = '#grdRequestList';
    await page.waitForSelector(selector);
    const rows = await tableData(selector);
    return rows;
  }

  async function getPermits(href, selector, previous, attempts) {
    await gotoPage(href);

    selector || (selector = '#grdTransporterActions');

    let submitButton = await promiseAny(
      page.waitForSelector('#btnsubmit'),
      page.waitForSelector('#btnSubmit')
    );

    await page.waitForSelector(selector);

    const e = await page.$(selector);
    let rows = [];
    if (e) {
      const out = await promiseAny(
        page.waitForXPath(
          '//*[@id="grdTransporterActions"]/tbody/tr/td[contains(text(), "No Record(s) Found")]'
        ),
        openAll('#btnAll')
      );

      if (out === 2) {
        await delay(5000);
        rows = await tableData(selector);
      }
    }

    if (previous) {
      await page.waitForSelector('#ddlMonth');
      const month =
        moment()
          .subtract(1, 'month')
          .month() + 1;
      await page.select('#ddlMonth', '' + month);
      await page.click(submitButton == 1 ? '#btnsubmit' : '#btnSubmit');

      await openAll('#btnAll');
      await delay(5000);

      let p = await tableData(selector);
      rows = rows.concat(p || []);
    }
    return rows;
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

            // if (!txtField) {
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

  async function tpDetails(href) {
    await gotoPage(href);
    await page.waitForSelector('#lblgrosswt');

    const result = {};

    result.gross_weight = parseFloat(
      await page.$eval('#lblgrosswt', el => el.innerText.trim())
    );
    result.tare_weight = parseFloat(
      await page.$eval('#lbltarewt', el => el.innerText.trim())
    );
    result.transporter_name = await page.$eval('#lbltransporter', el =>
      el.innerText.trim()
    );

    return result;
  }

  async function permitVehiclesInit(href) {
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
          }), // The promise resolves after navigation has finished
          page.click('#btnsearch') // Clicking the link will indirectly cause a navigation
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
          console.error(ex);
          return {
            trucks: []
          };
        }
      } catch (ex) {
        console.error(ex);
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

  let credentials, globalHeadless;

  async function browserInit(cred, headless, tologin, cb, returnCompany) {
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
    initializeBrowser: browserInit,
    permitVehicles,
    permitVehiclesInit,
    tpDetails,
    lastTwoMonthPermits: getPermits,
    getNewPermits,
    transportAssignVehicles,
    getPermitDetails,
    releasePage,
    tagVehicle,
    gotoTagPage,
    disconnect,
    openBrowser
  };
};
