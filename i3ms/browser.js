const puppeteer = require('puppeteer');
const _ = require('lodash');
const moment = require('moment');

const monitorInternet = require('./monitor-internet-connection');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const html = async (page, handle) => page.evaluate(el => el.innerHTML, handle);
const text = async (page, handle) => page.evaluate(el => el.innerText, handle);

async function timeMe(num, txt) {
  let time = moment().format('dddd MM/DD/YYYY HH:mm:ss, ');
  console.log(time, txt);
}

process.on('unhandledRejection', async (reason, p) => {
  console.error(
    'Unhandled Rejection at: Promise (new page)',
    p,
    'reason:',
    reason
  );
});

// Globals
let browser;
let page;
let previousUrl;

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
  console.log('browspage called', href);
  let numAttempts = 1;
  let success = true;

  previousUrl = href;

  while (numAttempts < 80) {
    try {
      await page.goto(href, { waitUntil: 'networkidle2' });
      success = true;
      break;
    } catch (ex) {
      console.error(ex);
      console.log('Retrying', numAttempts, href);
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
    if (myAttempt != loginAttempt) {
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
    await page.goto(previousUrl, { waitUntil: 'networkidle2' });
  } catch (ex) {
    console.error(ex);
    login(myAttempt);
  }
}

async function i3msLogin() {
  loginAttempt++;
  return login(loginAttempt);
}

async function createPage() {
  credentials || (credentials = {});

  const pages = await browser.pages();

  page = pages[0];

  monitorInternet(page);

  page.on('dialog', async dialog => {
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
    await page.exposeFunction('onPageError', e => page.emit('windowerror', e));
    await page.evaluateOnNewDocument(() => {
      addEventListener('error', e => onPageError(e));
    });
  } catch (ex) {}

  //page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
}

function disconnectHandler(e) {
  console.log('browser disconnected, trying to connect after 1min');
  browser = null;
  page = null;
  setTimeout(async () => {
    await createBrowser();
    await createPage();
  }, 10000);
}

async function createBrowser(headless) {
  if (!browser) {
    try {
      browser = await puppeteer.launch({
        headless: !!headless,
        executablePath:
          process.platform == 'win32'
            ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
            : '/usr/bin/google-chrome',
        defaultViewport: {
          width: 1200,
          height: 800
        },
        timeout: 0,
        args: [
          '--remote-debugging-port=9222',
          '--kiosk-printing',
          '--disable-background-timer-throttling',
          '--enable-print-preview'
        ]
      });
      console.log('browser created');
      browser.on('disconnected', disconnectHandler);
      browser.on('error', () => page.reload());
    } catch (ex) {
      console.error(ex);
      browser = await puppeteer.connect({
        headless: !!headless,
        browserURL: 'http://localhost:9222',
        defaultViewport: {
          width: 1200,
          height: 800
        }
      });
    }
  }
}

async function promiseAny(...promises) {
  return await Promise.race(
    promises.map((p, i) => {
      return new Promise(async (r, j) => {
        try {
          await p;
          r(i + 1);
        } catch (ex) {
          j(ex);
        }
      });
    })
  );
}

// api starts from here
export async function tagInit(href) {
  console.log('href', href);
  await browsePage(href);
  console.log('waiting for #grTrAction');
  const r = await extractRowDetails('#grTrAction');
  const v = await page.$eval('#lbtn_count', el => el.innerText);
  console.log('Number of vehicles tagged', v);
  if (v) {
    r.tagged = +v;
  }
  return r;
}

async function navigationClickHelper(selector, timeout = 5000) {
  return Promise.all([
    page.waitForNavigation({ timeout }), // The promise resolves after navigation has finished
    page.click(selector) // Clicking the link will indirectly cause a navigation
  ]);
}

export async function tagVehicle(href, truckNo) {
  console.log('Trying to tag vehicle', truckNo);
  let reason = '';
  try {
    console.log('waiting for vehicle no box', truckNo);
    await page.waitForSelector('#txtVehicleNo', { timeout: 5000 });
    console.log('checking disabled box', truckNo);
    await page.$eval('#txtVehicleNo', el => (el.disabled = false));
    await typeInTextBox('#txtVehicleNo', truckNo);
    //await page.click('#btnsearch');
    console.log('clicking btnsearch', truckNo);

    await navigationClickHelper('#btnsearch'); // Clicking the link will indirectly cause a navigation

    // await page.waitForNavigation();
    console.log('waiting for radio or error message', truckNo);

    const r = await promiseAny(
      page.waitForSelector('#rdo_GPS_0', { timeout: 5000 }),
      page.waitForSelector('#lblMsg')
    );

    console.log('return from selectors', r);

    if (r == 1) {
      await navigationClickHelper('#rdo_GPS_0');
      await navigationClickHelper('#Rdo_VTS_0');
      await navigationClickHelper('#Rdo_SIM_0');
      await page.click('#chkClick');
      //await page.click('#btnSubmit');
      await navigationClickHelper('#btnSubmit'); // Clicking the link will indirectly cause a navigation
    } else {
      reason = page.$eval('#lblMsg', el => el.innerText);
      console.log('failed vehicle retrying...', truckNo);

      if (/something wrong/i.test(reason)) {
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

export async function releaseVehicle(href, trucks, permitNo) {
  console.log(href);
  await browsePage(href);

  console.log('before selectSecondOption');
  await page.waitForSelector('#ddlTransporter');

  const numberOfOptions = await page.$$eval(
    '#ddlTransporter option',
    options => options.length
  );

  let option = 2;
  while (option <= numberOfOptions) {
    try {
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
      const r = await page.$eval('#lstFrom', el => {
        const arr = [];

        for (let i = 0; i < el.options.length; ++i) {
          arr.push(el.options[i].value);
        }

        return arr;
      });

      if (!r.length && option < numberOfOptions) {
        option++;
      } else {
        for (let truckNo of trucks) {
          console.log('releasing trucks', truckNo);
          await page.select('#lstFrom', truckNo);
          await delay(2000);
          await page.click('#btnAdd');
        }
        await page.click('#btnRelease');
        await delay(2000);
        break;
      }
    } catch (ex) {
      await browsePage(href);
    }
  }
}

export async function taggedVehicles(href, permitNo) {
  console.log(href, permitNo);
  await browsePage(href);

  console.log('before selectSecondOption');
  await page.waitForSelector('#ddlTransporter');

  const numberOfOptions = await page.$$eval(
    '#ddlTransporter option',
    options => options.length
  );

  let option = 2;
  while (option <= numberOfOptions) {
    try {
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
      const r = await page.$eval('#lstFrom', el => {
        const arr = [];

        for (let i = 0; i < el.options.length; ++i) {
          arr.push(el.options[i].value);
        }

        return arr;
      });

      if (!r.length && option < numberOfOptions) {
        option++;
      } else {
        console.log('returning');
        return r;
      }
    } catch (ex) {
      console.error(ex);
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
        .substr(
          0,
          row[2].lastIndexOf('(') != -1
            ? row[2].lastIndexOf('(')
            : row[2].length
        )
        .toUpperCase();
      return p;
    },
    {}
  );
}

export async function getPermitDetails(href, selector) {
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

export async function transportAssignVehicles(href) {
  await browsePage(href);
  return extractRowDetails('#grTrAction table');
}

export async function getNewPermits() {
  await browsePage(
    'https://i3ms.orissaminerals.gov.in/i3ms/pms/NewRequestTransporter.aspx'
  );
  const selector = '#grdRequestList';
  await page.waitForSelector(selector);
  const rows = await extractTable(selector);
  console.log(rows);
  return rows;
}

export async function getPermits(href, selector, previous, attempts) {
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

export async function tpDetails(href) {
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

export async function permitVehiclesInit(href) {
  await browsePage(href);
}

export async function permitVehicles(href, permitNo, fromdate, todate) {
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
        page.waitForNavigation({ timeout: 120000 }), // The promise resolves after navigation has finished
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

    await delay(10000);

    const result = await extractRowDetails('#tabdata');

    //console.log(result);

    result.trucks = await extractTable('#grdpermitwise');

    return result;
  }

  return {
    trucks: []
  };
}

export async function getTrips(href) {
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

export async function disconnect() {
  if (browser) {
    await browser.close();
    browser = null;
  } else {
    return Promise.resolve();
  }
}

export async function openBrowser(headless) {
  console.log('Calling createBrowser');
  await createBrowser(headless);
  console.log('Calling createPage');

  await createPage();
  console.log('Calling browseInit finished');
}

export async function getDetails() {
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

let credentials;

export async function browserInit(cred, headless) {
  credentials = cred;
  // if (browser) {
  //   await disconnect();
  // }
  return openBrowser(headless);
}

if (require.main == module) {
  console.log('loading');
  (async () => {
    await browserInit({
      username: 'AABCN5129K4',
      password: 'Aabcnnecc@5129'
    });

    const r = await getPermits(
      'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewRequestTransporter.aspx',
      '#grdRequestList',
      true
    );
    console.log(r);
  })();
}
