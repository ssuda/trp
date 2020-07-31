const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment');
const findChrome = require('chrome-finder');

const { delay, timeMe, promiseAny, serialFromTP } = require('./utils');

process.on('unhandledRejection', async (reason, p) => {
  console.error(
    'Unhandled Rejection at: Promise (new page)',
    p,
    'reason:',
    reason
  );
});

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
  let previousUrl;
  let globalDisconnectHandler;
  let dlgMessage;

  async function createBrowser(headless) {
    console.log('process.env.SHOW_BROWSER  = ', process.env.SHOW_BROWSER);

    headless =
      process.env.SHOW_BROWSER == undefined ? true : !process.env.SHOW_BROWSER;

    console.log('creating/connecting browser in headless mode', headless);
    if (!browser) {
      browser = await puppeteer.launch({
        headless,
        args: browserArgs(headless),
        executablePath: findChrome(),
        defaultViewport: defaultViewport(headless),
        timeout: 0
      });
      console.log('browser created');
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

  async function createPage() {
    credentials || (credentials = {});

    const pages = await browser.pages();

    page = pages[0];

    //monitorInternet(page);

    page.on('dialog', async dialog => {
      dlgMessage = dialog.message();
      console.log('the dialog message is', dialog.message());
      console.log('the dialog type is', dialog.type());
      try {
        await dialog.accept();
      } catch (ex) {
        // console.error(ex);
      }
      timeMe(1, 'Dismiss Dialog...');
    });

    page.on('response', async response => {
      const url = response.url();
      const status = response.status();

      const type = response.request().resourceType();
      const method = response.request().method();

      if (
        type == 'document' &&
        method == 'GET' &&
        url.includes('/i3msnew1.aspx')
      ) {
        console.log('calling i3ms login', url);
        await i3msLogin();
      }
    });

    page.on('windowerror', e => {
      console.error(e);
    });

    try {
      await page.exposeFunction('onPageError', e =>
        page.emit('windowerror', e)
      );
      await page.evaluateOnNewDocument(() => {
        addEventListener('error', e => onPageError(e));
      });
    } catch (ex) {}

    //page.setDefaultTimeout(300000);
    page.setDefaultNavigationTimeout(300000);
  }

  // utility functions
  function typeInTextBox(selector, v) {
    return page.$eval(selector, (el, v) => (el.value = v), v);
  }

  async function selectOption(selector, number) {
    const sel = `${selector} > option:nth-child(${number})`;
    await page.waitForSelector(sel);

    const val = await page.$eval(sel, el => el.value);
    await page.select(selector, val);
  }

  async function browsePage(href) {
    if (!browser || !page) {
      return;
    }
    console.log('browspage called', href);
    let numAttempts = 1;
    let success = true;

    previousUrl = href;

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
        console.log('Retrying', numAttempts, href);
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

  let loginAttempt = 0;

  async function login(myAttempt) {
    try {
      if (myAttempt != loginAttempt || !page) {
        return;
      }

      console.log('goto default.aspx');
      await page.goto('https://i3ms.orissaminerals.gov.in/Default.aspx?id=1');
      if (myAttempt != loginAttempt) {
        return;
      }
      await page.waitForSelector('#btnSubmit');
      if (myAttempt != loginAttempt) {
        return;
      }
      await typeInTextBox('#txtusr', credentials.username);
      if (myAttempt != loginAttempt) {
        return;
      }
      await typeInTextBox('#txtpwd', credentials.password);
      if (myAttempt != loginAttempt) {
        return;
      }
      await page.click('#btnSubmit');
      if (myAttempt != loginAttempt) {
        return;
      }
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      if (myAttempt != loginAttempt) {
        return;
      }
      await delay(2000);
      if (myAttempt != loginAttempt) {
        return;
      }

      if (previousUrl) {
        await page.goto(previousUrl, { waitUntil: 'networkidle2' });
      }
    } catch (ex) {
      console.error(ex);
      login(myAttempt);
    }
  }

  async function i3msLogin() {
    loginAttempt++;
    return login(loginAttempt);
  }

  // api starts from here
  async function tagInit(href) {
    console.log('href', href);
    let retries = 0;

    while (retries < 3) {
      await browsePage(href);
      console.log('waiting for #grTrAction');
      try {
        const r = await extractRowDetails('#grTrAction');
        const v = await page.$eval('#lbtn_count', el => el.innerText);
        console.log('Number of vehicles tagged', v);
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
    //console.log('Trying to tag vehicle', truckNo);
    let reason = '';
    try {
      //console.log('waiting for vehicle no box', truckNo);
      await page.waitForSelector('#txtVehicleNo', { timeout: 30000 });
      //console.log('checking disabled box', truckNo);
      await page.$eval(
        '#txtVehicleNo',
        (el, truckNo) => {
          el.disabled = false;
          el.value = truckNo;
          //document.querySelector('#btnsearch').click();
        },
        truckNo
      );
      //await typeInTextBox('#txtVehicleNo', truckNo);
      //await page.click('#btnsearch');
      //console.log('clicking btnsearch', truckNo);

      await navigationClickHelper('#btnsearch'); // Clicking the link will indirectly cause a navigation

      // await page.waitForNavigation();
      //console.log('waiting for radio or error message', truckNo);

      const r = await promiseAny(
        page.waitForSelector('#rdo_GPS_0', { timeout: 30000 }),
        page.waitForSelector('#lblMsg')
      );

      //console.log('Is Error? ', r == 2);

      if (r == 1) {
        // await page.evaluate(() => {
        //   document.querySelector('#rdo_GPS_0').checked = true;
        //   document.querySelector('#Rdo_VTS_0').checked = true;
        //   document.querySelector('#chkClick').checked = true;
        // });
        await setRadioButton('#rdo_GPS_0');
        // await navigationClickHelper('#rdo_GPS_0');
        await setRadioButton('#Rdo_VTS_0');
        // await navigationClickHelper('#Rdo_VTS_0');
        // await setRadioButton('#Rdo_SIM_0');
        await navigationClickHelper('#Rdo_SIM_0');
        // await setRadioButton('#chkClick');
        await page.click('#chkClick');
        // await page.click('#btnSubmit');
        await navigationClickHelper('#btnSubmit'); // Clicking the link will indirectly cause a navigation
        await delay(100);
      } else {
        reason = page.$eval('#lblMsg', el => el.innerText);

        if (/something wrong/i.test(reason)) {
          //console.log('failed vehicle retrying...', truckNo);
          return tagVehicle(href, truckNo);
        }
      }

      return reason;
    } catch (ex) {
      console.error(ex);
      if (/(execution context)|(network|timeout)/i.test(ex.message)) {
        await tagInit(href);
        return tagVehicle(href, truckNo);
      }
      console.log('failed vehicle', truckNo);
      return false;
    }
  }

  async function navigationClickHelper(selector, timeout = 30000) {
    return Promise.all([
      page.waitForNavigation({ timeout }), // The promise resolves after navigation has finished
      page.click(selector) // Clicking the link will indirectly cause a navigation
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
        console.log(href);
        await browsePage(href);

        console.log('before selectSecondOption');
        await page.waitForSelector('#ddlTransporter');

        numberOfOptions = await page.$$eval(
          '#ddlTransporter option',
          options => options.length
        );

        console.log('before ddlTransporter');

        await selectOption('#ddlTransporter', option);

        if (permitNo[0] == 'L') {
          await page.select('#ddlPermitType', '1');
        } else {
          await page.select('#ddlPermitType', '2');
        }
        await typeInTextBox('#txtPermitNo', permitNo);
        const [response] = await Promise.all([
          page.waitForNavigation(), // The promise resolves after navigation has finished
          page.click('#btnGetVehicle') // Clicking the link will indirectly cause a navigation
        ]);

        console.log('waiting for selector');

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
              console.log('releasing trucks', truckNo);
              await page.select('#lstFrom', truckNo);
              //await delay(2000);
              await page.click('#btnAdd');
            }

            if (await page.$('#btnRelease')) {
              await page.click('#btnRelease');
            }
            await delay(2000);
            r = _.difference(r, trucks);
          }
          return r;
        }
      } catch (ex) {
        console.error(ex);
        if (!browser || !page) {
          break;
        }
        await browsePage(href);
      }
    }
  }

  async function extractRowDetails(selector) {
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
        p[row[0]] = row[2]
          /*.substr(
            0,
            row[2].lastIndexOf('(') != -1
              ? row[2].lastIndexOf('(')
              : row[2].length
          )*/
          .toUpperCase();
        return p;
      },
      {}
    );
  }

  async function getPermitDetails(href, selector) {
    await browsePage(href);
    console.log('before extract');
    selector || (selector = '#grTrAction');
    const result = await extractRowDetails(selector);
    console.log(result);
    return result;
  }

  async function waitForPaging(selector) {
    await page.waitForSelector(selector);
    const text = await page.$eval(selector, el => el.innerText);
    console.log(text);
    if (!/paging/i.test(text)) {
      await page.click(selector);
      console.log('waiting for paging');
      await page.waitForFunction('!document.querySelector(".paging")');
    }
  }

  async function transportAssignVehicles(href) {
    await browsePage(href);
    return extractRowDetails('#grTrAction table');
  }

  async function getNewPermits() {
    await browsePage(
      'https://i3ms.orissaminerals.gov.in/i3ms/pms/NewRequestTransporter.aspx'
    );
    const selector = '#grdRequestList';
    await page.waitForSelector(selector);
    const rows = await extractTable(selector);
    console.log(rows);
    return rows;
  }

  async function getPermits(href, selector, previous, attempts) {
    console.log(href);

    await browsePage(href);

    selector || (selector = '#grdTransporterActions');

    console.log('waiting for btnAll');
    let submitButton = await promiseAny(
      page.waitForSelector('#btnsubmit'),
      page.waitForSelector('#btnSubmit')
    );

    await page.waitForSelector(selector);

    const e = await page.$(selector);
    let rows = [];
    console.log('element exists', !!e);

    if (e) {
      const out = await promiseAny(
        page.waitForXPath(
          '//*[@id="grdTransporterActions"]/tbody/tr/td[contains(text(), "No Record(s) Found")]'
        ),
        waitForPaging('#btnAll')
      );

      if (out === 2) {
        console.log('before extract this month');
        await delay(5000);
        rows = await extractTable(selector);
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

      await waitForPaging('#btnAll');
      console.log('before extract previous month');
      await delay(5000);

      let p = await extractTable(selector);
      rows = rows.concat(p || []);
    }
    //console.log(rows);
    return rows;
  }

  async function extractTable(selector, txtField) {
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
            //console.log(obj);
            rows.push(obj);
          }
        });
        return rows;
      },
      txtField
    );
  }

  async function tpDetails(href) {
    await browsePage(href);
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
    await browsePage(href);
  }

  async function permitVehicles(href, permitNo, fromdate, todate) {
    if (href) {
      await browsePage(href);
    }
    await page.waitForSelector('#txtpermit');

    fromdate ||
      (fromdate = moment()
        .subtract(1, 'day')
        .format('DD-MMM-YYYY'));
    todate || (todate = moment().format('DD-MMM-YYYY'));

    console.log('waiting for navigation idle2');
    let r = 3;

    while (r == 3) {
      try {
        await typeInTextBox('#txtpermit', permitNo);

        await typeInTextBox('#frm_txt_date', fromdate);

        await typeInTextBox('#to_txt_date', todate);

        console.log('Retrying in loop');
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

      //await delay(10000);

      const result = await extractRowDetails('#tabdata');

      //console.log(result);

      result.trucks = await extractTable('#grdpermitwise');

      return result;
    }

    return {
      trucks: []
    };
  }

  async function getTrips(href) {
    console.log(href);

    await browsePage(href);

    await page.waitForSelector('#lbtnAll');

    console.log('waiting for lbtnAll');

    await page.click('#lbtnAll');
    await delay(1000);

    const rows = await page.evaluate(() => {
      const trs = document.querySelectorAll('#grd_itemlist tr');
      let first_row = true;
      const headers = [];
      const rows = [];
      trs.forEach(tr => {
        if (first_row) {
          first_row = false;
          const ths = tr.querySelectorAll('th');
          ths.forEach(td => {
            console.log(td.innerHTML, td.innerText, td.textContent);
            headers.push(td.innerText.trim());
          });
        } else {
          const tds = tr.querySelectorAll('td');
          const obj = {};
          let i = 0;
          tds.forEach(td => {
            obj[headers[i]] = td.innerText.trim();

            i++;
          });
          //console.log(obj);
          rows.push(obj);
        }
      });
      return rows;
    });

    // console.log(rows);
    return rows;
  }

  async function receiveConfirm(href, permitNo, selector) {
    await browsePage(href);
    //await page.waitForSelector('#txtPermit');
    await page.waitForSelector('#ddlUserType');

    if (permitNo[0] == 'L') {
      await page.select('#ddlUserType', '1');
    } else {
      await page.select('#ddlUserType', '2');
    }
    await page.type('#txtPermit', permitNo);

    await page.click('#btnSearch');
    try {
      while (true) {
        console.log('Waiting for checkbox');
        const r = await promiseAny(
          page.waitForSelector(
            '#grdRecvPass > tbody > tr:nth-child(1) > th:nth-child(1) > input[type=checkbox]'
          ),
          page.waitForXPath(
            '//*[@id="grdRecvPass"]/tbody/tr/td[contains(text(), "No Record")]'
          )
        );

        console.log('return value', r);

        if (r == 2) {
          break;
        }

        //await waitForPaging('#lbtnAll');
        await page.click(
          '#grdRecvPass > tbody > tr:nth-child(1) > th:nth-child(1) > input[type=checkbox]'
        );
        await page.click('#btnProceed');
        //await page.waitForNavigation({ waitUntil: 'networkidle0' });
        await delay(10000);
        const y = await page.$('#lblPaging');
        console.log('paging', y);
        if (!y) {
          break;
        }

        const x = await page.$eval('#lblPaging', el => el.textContent);
        console.log('paging content', x);

        if (!x) {
          break;
        }
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  async function receiveMineral(href, permitNo, selector, vehicles) {
    if (!vehicles || !_.isObject(vehicles)) {
      console.log('vehicles not passed');
      return;
    }

    try {
      await browsePage(href);

      console.log('wait for selector');

      await page.waitForSelector('#ddlUserType');

      if (permitNo[0] == 'L') {
        await page.select('#ddlUserType', '1');
      } else {
        await page.select('#ddlUserType', '2');
      }

      //await page.waitForNavigation({ waitUntil: "networkidle0" });

      await page.focus('#txtPermit');

      await page.type('#txtPermit', permitNo);

      //await page.$eval('#txtPermit', (el, p) => el.value = p, permitNo);

      //await page.waitForNavigation({ waitUntil: "networkidle0" });

      //await delay(2000);

      await page.$eval('#txtPermit', (el, p) => (el.value = p), permitNo);

      await delay(5000);

      await page.$eval('#txtPermit', (el, p) => (el.value = p), permitNo);

      //await page.type('#txtPermit', permitNo);
      await page.waitForSelector('#btnSearch');
      await page.click('#btnSearch');

      //await page.waitForSelector('#ddlStack');

      const ret = await promiseAny(
        page.waitForSelector('#ddlStack > option:nth-child(2)'),
        page.waitForSelector('.ajax__validatorcallout_error_message_cell')
      );

      console.log('after selector', ret);

      if (ret == 2) {
        await page.$eval('#txtPermit', (el, p) => (el.value = p), permitNo);
        //await page.type('#txtPermit', permitNo);
        await page.click('#btnSearch');
      }
      await page.waitForSelector('#ddlStack > option:nth-child(2)');

      let val = await page.$eval(
        '#ddlStack > option:nth-child(2)',
        el => el.value
      );

      await page.select('#ddlStack', val);

      //await page.waitForNavigation({ waitUntil: "networkidle0" });

      await page.waitForSelector('#ddlNature > option:nth-child(2)');

      val = await page.$eval(
        '#ddlNature > option:nth-child(2)',
        el => el.value
      );

      await page.select('#ddlNature', val);

      await page.waitForSelector('#ddlGrade > option:nth-child(2)');

      val = await page.$eval('#ddlGrade > option:nth-child(2)', el => el.value);

      await page.select('#ddlGrade', val);

      await page.click('#btnfind');

      console.log('waiting for btnAll');

      await page.waitForSelector('#grdRecvPass > tbody > tr > td');
      //await page.waitForSelector('#lbtnAll');
      const btn = await page.$('#lbtnAll');

      if (btn) {
        // await page.click('#lbtnAll');

        await waitForPaging('#lbtnAll');

        // await page.waitForFunction('!document.querySelector(".paging")');

        selector || (selector = '#grdRecvPass');

        if (vehicles) {
          await page.waitForSelector('#btnProceed');
          let rows = await extractTable(selector, true);
          let selected = {};

          do {
            //exclude not checked
            rows = _.filter(
              rows,
              row => !/not checked/i.test(row['Check Date'])
            );

            const chunks = _.chunk(rows, 15);

            await chunks.reduce(async (prev, chunk) => {
              await prev;
              await chunk.reduce(async (p, row) => {
                await p;

                if (vehicles[row['Pass No']]) {
                  await page.click('#' + row.select_box);
                  selected[row['Pass No']] = true;
                  console.log(row['Received Date']);
                  console.log(row['Pass Date']);
                  const d = moment(vehicles[row['Pass No']]).format(
                    'MM/DD/YYYY hh:mm A'
                  );
                  console.log(d);
                  await page.$eval('#' + row['Received Date'], (el, p) =>
                    $(el).replaceWith($(el).clone())
                  );
                  await page.$eval(
                    '#' + row['Received Date'],
                    (el, p) => (el.value = p),
                    d
                  );
                }

                return Promise.resolve();
              }, Promise.resolve());

              console.log('Proceeding');
              await page.click('#btnProceed');
              await page.waitForSelector(selector);
              await delay(10000);
              rows = await extractTable(selector);
              return Promise.resolve();
            }, Promise.resolve());

            _.each(rows, row => {
              if (selected[row['Pass No']]) {
                delete selected[row['Pass No']];
              }
            });

            _.each(selected, (v, k) => {
              if (vehicles[k]) {
                vehicles[k] = 'updated';
              }
            });

            //find sequence
            const tps = _.map(rows, row => serialFromTP(row['Pass No']));

            _.each(vehicles, (v, k) => {
              const ser = serialFromTP(k);
              console.log(ser, tps[tps.length - 1], tps.includes(ser));
              if (!tps.includes(ser) && ser < tps[tps.length - 1]) {
                console.log('Updating tp', k, ser);
                vehicles[k] = 'updated';
              }
            });
          } while (dlgMessage == 'Are you sure to update the record?');
        }
      } else {
        //no more records
        const val = await page.$x(
          '//*[@id="grdRecvPass"]/tbody/tr/td[contains(text(), "No Record")]'
        );
        if (_.isObject(vehicles) && val) {
          console.log('Updating all');
          _.each(vehicles, (v, k) => {
            vehicles[k] = 'updated';
          });
        }
      }

      return [];
    } catch (ex) {
      return receiveMineral(href, permitNo, selector, vehicles);
    }
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

    console.log('Calling createBrowser', headless);
    await createBrowser(headless);
    console.log('Calling createPage');

    await createPage();
    console.log('Calling browseInit finished');
  }

  async function getDetails() {
    await browsePage(
      'https://i3ms.orissaminerals.gov.in/i3MS/OMPTSNEW/ViewLicenseeReceiveePass.aspx'
    );

    console.log('waiting for selector');
    console.log('after selector');

    await page.click('#lbtnAll');

    console.log('after click');

    await delay(5000);

    console.log('evaluating Paging  Results 1 - 101 Of 101');

    let today = await page.evaluate(() => {
      return $('#grd_itemlist tr:contains(19-Oct-2019) a')
        .map(function() {
          return this.id;
        })
        .get();
    });

    console.log(today);
    let rows = [];

    const hrefs = await Promise.all(
      today.map(val => page.$eval('#' + val, el => el.href))
    );

    console.log(hrefs);

    await hrefs.reduce(async (p, href) => {
      await p;
      const r = await getTrips(href);
      rows = rows.concat(r);
      return Promise.resolve();
    }, Promise.resolve());

    console.log(rows);
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
      await i3msLogin();
    }

    if (returnCompany) {
      return companyName();
    }
  }

  async function dailyI3msData(date) {
    await browsePage(
      `https://i3ms.orissaminerals.gov.in/I3MS/ePass/TruckWiseReportDtls.aspx?fromdate=${date}&todate=${date}&Sourcetype=0`
    );
    console.log('Waiting for lbtnAll');
    await page.waitForSelector('#lbtnAll');
    console.log('Clicking lbtnAll');
    await navigationClickHelper('#lbtnAll', 600000);
    console.log('Clicking lbtnAll');
    await navigationClickHelper('#lbtnAll', 600000);
    console.log('Extracting table');
    return extractTable('#grd_itemlist');
  }

  async function i3msVehicles() {
    await browsePage(
      `https://i3ms.orissaminerals.gov.in/website/RegisteredVehicleReport.aspx`
    );
    console.log('Waiting for lbtnAll');
    await page.waitForSelector('#lbtnAll');
    console.log('Clicking lbtnAll');
    await navigationClickHelper('#lbtnAll', 0);
    // console.log('Clicking lbtnAll');
    // await navigationClickHelper('#lbtnAll', 600000);
    console.log('Extracting table');
    await page.waitForSelector('#grvVeiwVehicleReg', { timeout: 0 });
    await delay(180000);
    return extractTable('#grvVeiwVehicleReg');
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
    browserInit,
    getDetails,
    permitVehicles,
    permitVehiclesInit,
    tpDetails,
    getPermits,
    getNewPermits,
    transportAssignVehicles,
    getPermitDetails,
    releasePage,
    tagVehicle,
    tagInit,
    disconnect,
    receiveConfirm,
    receiveMineral,
    openBrowser,
    dailyI3msData,
    i3msVehicles
  };
};
