// Run with: node tests/testI3msLogin.js
// Uses the installed Puppeteer and the real browser factory against a local
// Web Forms fixture. No request reaches the i3ms portal and no OCR is used.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const path = require('path');
const { execFileSync } = require('child_process');
const { transformFileSync } = require('@babel/core');
const puppeteer = require('puppeteer');
const moment = require('moment');

const root = path.resolve(__dirname, '..');
const browserFile = path.join(root, 'api/browser.js');
const realBrowsers = [];
const instances = [];
const navigationOptions = [];
let firstForms = [];
let nextSession = 0;
let activeSubmissions = 0;
let maxActiveSubmissions = 0;
const attempts = new Map();
const authenticatedSessions = new Set();
const pendingDashboardSubmissions = new Set();
const protectedPageVisits = new Map();
const taggingPageVisits = new Map();
const redirectedSessions = new Set();
const sessionWarning =
  'Either you have already loged in or not properly signed out. Only one login is allowed for a particular user. Please contact ITPMU in case of any problem.';
let fixtureStopped = false;
let watchedSession;
let watchActive = false;
let watchStopped = false;
let watchReads = 0;
let watchReloads = 0;
let watchDetailRequests = 0;
const watchWaits = [];
const watchNavigations = [];
const watchLogs = [];
let releaseHeldLogin;
let heldLoginStarted;
const heldLogin = new Promise(resolve => {
  heldLoginStarted = resolve;
});

const form = message => `<!doctype html><html><body>
  <form method="post" onsubmit='if (document.getElementById("txtusr").value === "session-warning-popup") { alert(${JSON.stringify(
    sessionWarning
  )}); setTimeout(() => location.href = "/LoginLanding.aspx?warning=1", 100); return false; }'><input id="txtusr" name="username">
  <input id="txtpwd" name="password" type="password">
  <button id="btnSubmit" type="submit">Login</button>
  <span id="lblMsg">${message || ''}</span></form></body></html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const session = (request.headers.cookie || '').match(/fixtureSession=(\d+)/);
  if (
    watchActive &&
    session &&
    session[1] === watchedSession &&
    /VehicleDetails|TransporterAssignVehicleNew|PermitWiseTransportDetails|ReleaseVehicle/i.test(
      url.pathname
    )
  )
    watchDetailRequests++;
  if (/\/Default\.aspx/i.test(url.pathname) && request.method === 'GET') {
    const sendForm = () => {
      response.writeHead(200, {
        'Content-Type': 'text/html',
        'Set-Cookie': `fixtureSession=${session ? session[1] : ++nextSession}`
      });
      response.end(form());
    };
    // Initial forms must load concurrently. A queue held during page.goto()
    // cannot reach this barrier and makes the regression test time out.
    if (nextSession < 3) {
      firstForms.push(sendForm);
      if (firstForms.length === 3) {
        firstForms.forEach(send => send());
        firstForms = [];
      }
    } else {
      sendForm();
    }
    return;
  }

  if (/\/Default\.aspx/i.test(url.pathname) && request.method === 'POST') {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      const username = new URLSearchParams(body).get('username');
      const key = session[1];
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      activeSubmissions++;
      maxActiveSubmissions = Math.max(maxActiveSubmissions, activeSubmissions);
      const finish = () => {
        if (
          [
            'direct-permit-page',
            'other-page-warning',
            'outside-http-error',
            'delayed-redirect',
            'click-ack-loss'
          ].includes(username)
        ) {
          activeSubmissions--;
          if (count > 1) {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(
              form('Password is incorrect (fixture: permit page was ignored)')
            );
          } else {
            authenticatedSessions.add(key);
            if (username === 'other-page-warning') redirectedSessions.add(key);
            if (username === 'delayed-redirect') {
              response.writeHead(200, { 'Content-Type': 'text/html' });
              response.end(
                form() +
                  '<script>setTimeout(() => location.href = "/LoginLanding.aspx", 250);</script>'
              );
            } else {
              response.writeHead(302, {
                Location:
                  username === 'direct-permit-page'
                    ? '/i3ms/pms/ViewTransporterAction.aspx'
                    : username === 'outside-http-error'
                    ? '/LoginLanding.aspx?error=503'
                    : '/LoginLanding.aspx?warning=1'
              });
              response.end();
            }
          }
          return;
        }
        if (username.startsWith('session-warning')) {
          activeSubmissions--;
          const expected = username === 'session-warning-direct' ? 1 : 2;
          if (count > expected) {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(
              form('Password is incorrect (fixture: login was restarted)')
            );
          } else if (count === expected) {
            authenticatedSessions.add(key);
            redirectedSessions.add(key);
            response.writeHead(302, {
              Location: '/LoginLanding.aspx?warning=1'
            });
            response.end();
          } else {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end(form(sessionWarning));
          }
          return;
        }
        if (username === 'incorrect-password' || count < 3) {
          activeSubmissions--;
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end(
            form(
              username === 'incorrect-password'
                ? 'Password is incorrect'
                : 'Please try again'
            )
          );
        } else {
          // Mixed casing must still be recognized as a successful dashboard.
          authenticatedSessions.add(key);
          pendingDashboardSubmissions.add(key);
          response.writeHead(302, { Location: '/DASHBOARD_TR.aspx' });
          response.end();
        }
      };
      if (username === 'held-login') {
        // This case succeeds on the first submit once the test releases it.
        attempts.set(key, 3);
        releaseHeldLogin = () => {
          authenticatedSessions.add(key);
          pendingDashboardSubmissions.add(key);
          response.writeHead(302, { Location: '/DASHBOARD_TR.aspx' });
          response.end();
        };
        heldLoginStarted();
      } else {
        setTimeout(finish, 25);
      }
    });
    return;
  }

  if (/\/LoginLanding\.aspx/i.test(url.pathname)) {
    const key = session && session[1];
    if (!authenticatedSessions.has(key)) {
      response.writeHead(302, { Location: '/Default.aspx' });
      response.end();
      return;
    }
    response.writeHead(url.searchParams.has('error') ? 503 : 200, {
      'Content-Type': 'text/html'
    });
    response.end(
      `<html><body><div class="welcome">Welcome fixture</div><input id="txtusr" type="hidden"><span id="lblMsg">${
        url.searchParams.has('warning') ? sessionWarning : ''
      }</span></body></html>`
    );
    return;
  }

  if (/\/TransporterAssignVehicleNew\.aspx/i.test(url.pathname)) {
    const key = session && session[1];
    taggingPageVisits.set(key, (taggingPageVisits.get(key) || 0) + 1);
    if (!authenticatedSessions.has(key)) {
      response.writeHead(302, { Location: '/Default.aspx' });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      '<html><body><table id="grTrAction"></table><input id="txtVehicleNo"></body></html>'
    );
    return;
  }

  if (/\/VehicleDetails\.aspx/i.test(url.pathname)) {
    const key = session && session[1];
    if (!authenticatedSessions.has(key)) {
      response.writeHead(302, { Location: '/Default.aspx' });
      response.end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<html><body><table id="grTrAction">
      <tr><td>Permit No.</td><td>:</td><td>${url.searchParams.get(
        'name'
      )}</td></tr>
      <tr><td>Requested By</td><td>:</td><td>Mine</td></tr>
      <tr><td>Transported From</td><td>:</td><td>Pit A</td></tr>
      <tr><td>Permit Qty.</td><td>:</td><td>100</td></tr>
      <tr><td>Permit Validity</td><td>:</td><td>${moment()
        .add(1, 'month')
        .format('DD MMM YYYY')}</td></tr>
      </table></body></html>`);
    return;
  }

  if (/\/ViewTransporterAction\.aspx/i.test(url.pathname)) {
    const key = session && session[1];
    protectedPageVisits.set(key, (protectedPageVisits.get(key) || 0) + 1);
    if (redirectedSessions.has(key)) {
      response.writeHead(302, { Location: '/LoginLanding.aspx?warning=1' });
      response.end();
      return;
    }
    if (!authenticatedSessions.has(key)) {
      response.writeHead(302, { Location: '/Default.aspx' });
      response.end();
      return;
    }
    if (watchActive && key === watchedSession) {
      watchReads++;
      const today = moment().format('DD MMM YYYY');
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<html><body><button id="btnsubmit">Search</button><button id="btnSubmit">Search</button><table id="grdTransporterActions">
        <tr><th>Permit No.</th><th>Request On</th><th>Lessee/Licensee Name</th><th>Tag New Vehicle</th><th>Vehicle Details</th></tr>
        <tr><td>WATCH-${watchReads}</td><td>${today}</td><td>List identity-123</td><td><a href="https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx?name=WATCH-${watchReads}">Tag</a></td><td></td></tr>
        <tr><td>DERIVED</td><td>${today}</td><td>List identity-123</td><td></td><td><a href="https://i3ms.odishaminerals.gov.in/i3ms/pms/VehicleDetails.aspx?name=DERIVED">Details</a></td></tr>
        </table></body></html>`);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      '<html><body><div class="welcome">Welcome fixture</div><table id="grdTransporterActions"></table></body></html>'
    );
    return;
  }

  if (/\/Dashboard_TR\.aspx/i.test(url.pathname)) {
    const key = session && session[1];
    if (!authenticatedSessions.has(key)) {
      response.writeHead(302, { Location: '/Default.aspx' });
      response.end();
      return;
    }
    // Include a real response-body delay: login must await DOM readiness.
    response.writeHead(200, { 'Content-Type': 'text/html' });
    setTimeout(() => {
      if (pendingDashboardSubmissions.delete(key)) activeSubmissions--;
      response.end(
        '<html><body><div class="welcome">Welcome fixture</div></body></html>'
      );
    }, 25);
    return;
  }
  response.writeHead(404);
  response.end();
});

function loadBrowserFactory(port) {
  const utilsFile = path.join(root, 'api/utils.js');
  const utilities = new Module(utilsFile, module);
  utilities.filename = utilsFile;
  utilities._compile(
    transformFileSync(utilities.filename, {
      configFile: false,
      babelrc: false,
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }).code,
    utilities.filename
  );
  const realDelay = utilities.exports.delay;
  utilities.exports.delay = ms => {
    if (watchActive && ms === 5000) {
      watchWaits.push(ms);
      return Promise.resolve();
    }
    return realDelay(ms);
  };

  const factory = new Module(browserFile, module);
  factory.paths = Module._nodeModulePaths(path.dirname(browserFile));
  const normalRequire = factory.require.bind(factory);
  factory.require = name => {
    if (name === 'fixture-console') {
      return {
        log: (...args) => {
          if (watchActive) watchLogs.push(args);
          console.log(...args);
        },
        error: (...args) => console.error(...args)
      };
    }
    if (name === './utils') return utilities.exports;
    if (name === './captch-browser') {
      return () => {
        throw new Error('OCR must not run during login');
      };
    }
    if (name !== 'puppeteer') return normalRequire(name);
    return {
      launch: async options => {
        // Select one stable initial page before wrapping goto(). Otherwise a
        // late about:blank target can become the factory's unwrapped page.
        const browser = await puppeteer.launch({
          ...options,
          waitForInitialPage: true
        });
        if (fixtureStopped) {
          await browser.close();
          throw new Error('Login fixture stopped');
        }
        realBrowsers.push(browser);
        const page = (await browser.pages())[0] || (await browser.newPage());
        await page.setRequestInterception(true);
        page.on('request', request => {
          const destination = new URL(request.url());
          if (
            destination.hostname === '127.0.0.1' &&
            destination.port === String(port)
          ) {
            request.continue().catch(() => {});
          } else {
            request.abort().catch(() => {});
          }
        });
        const goto = page.goto.bind(page);
        page.goto = (url, settings) => {
          const destination = new URL(url);
          assert.equal(destination.hostname, 'i3ms.odishaminerals.gov.in');
          if (watchActive) watchNavigations.push(destination.pathname);
          return goto(
            `http://127.0.0.1:${port}${destination.pathname}${destination.search}`,
            settings
          );
        };
        const reload = page.reload.bind(page);
        page.reload = settings => {
          if (watchActive) {
            watchReloads++;
            assert.equal(settings.waitUntil, 'domcontentloaded');
          }
          return reload(settings);
        };
        const waitForNavigation = page.waitForNavigation.bind(page);
        page.waitForNavigation = settings => {
          navigationOptions.push(settings);
          return waitForNavigation(settings);
        };
        const click = page.click.bind(page);
        page.click = async selector => {
          const username = await page
            .$eval('#txtusr', el => el.value)
            .catch(() => '');
          if (username === 'click-ack-loss') {
            await Promise.all([
              waitForNavigation({
                waitUntil: 'domcontentloaded',
                timeout: 180000
              }),
              click(selector)
            ]);
            throw new Error(
              'Execution context was destroyed, most likely because of a navigation.'
            );
          }
          return click(selector);
        };
        return browser;
      }
    };
  };
  const source = process.argv.includes('--baseline')
    ? execFileSync('git', ['show', 'HEAD:api/browser.js'], {
        cwd: root,
        encoding: 'utf8'
      })
    : fs.readFileSync(browserFile, 'utf8');
  factory._compile(
    `const console = require('fixture-console');\n${source}`,
    browserFile
  );
  return factory.exports;
}

function loadMonitorApi(monitor) {
  const filename = path.join(root, 'api/index.js');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const normalRequire = loaded.require.bind(loaded);
  loaded.require = name => {
    if (name === './browser') return () => monitor;
    if (name === 'console-stamp') return () => {};
    if (name === './utils') {
      return {
        delay: async ms => {
          assert.equal(ms, 5000);
          watchWaits.push(ms);
        },
        promiseWithTimeout: promise => promise
      };
    }
    return normalRequire(name);
  };
  loaded._compile(
    transformFileSync(filename, {
      configFile: false,
      babelrc: false,
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }).code,
    filename
  );
  return loaded.exports;
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browserFactory = loadBrowserFactory(server.address().port);
  const credentials = {
    username: 'fixture-user',
    password: 'fixture-password'
  };
  const started = Date.now();
  for (let i = 0; i < 3; i++) instances.push(browserFactory(i));
  await Promise.all(
    instances.map(instance =>
      instance.initializeBrowser(credentials, true, true)
    )
  );
  assert.equal(
    maxActiveSubmissions,
    1,
    'login submissions must remain serialized'
  );
  assert.deepEqual(
    [...attempts.values()],
    [3, 3, 3],
    'every transient failure must retry'
  );
  assert(instances.every(instance => instance.isLoggedIn()));
  assert(instances.every(instance => !instance.isLoggingIn()));
  assert(
    navigationOptions.every(options => options.waitUntil === 'domcontentloaded')
  );
  assert(
    navigationOptions.every(options => options.timeout === 180000),
    'allow slow responses three minutes'
  );
  console.log(
    'PASS: concurrent form preparation, immediate rejection retry and serialized login in',
    Date.now() - started,
    'ms'
  );
  await Promise.all(instances.map(instance => instance.disconnect()));

  const incorrect = browserFactory('incorrect');
  instances.push(incorrect);
  await assert.rejects(
    incorrect.initializeBrowser(
      { username: 'incorrect-password', password: 'fixture' },
      true,
      true
    ),
    /password is incorrect/
  );
  assert.equal(
    attempts.get(String(nextSession)),
    1,
    'incorrect passwords stop after one attempt'
  );
  assert.equal(incorrect.isLoggedIn(), false);
  console.log('PASS: explicit incorrect password stops immediately');
  await incorrect.disconnect();

  const direct = browserFactory('direct-permit-page');
  instances.push(direct);
  await direct.initializeBrowser(
    { username: 'direct-permit-page', password: 'fixture' },
    true,
    true
  );
  assert.equal(direct.isLoggedIn(), true);
  assert.equal(attempts.get(String(nextSession)), 1);
  assert(
    direct
      .getPage()
      .url()
      .includes('/ViewTransporterAction.aspx')
  );
  console.log(
    'PASS: login can land directly on a permit page without a dashboard'
  );
  await direct.disconnect();

  for (const [username, expectedAttempts] of [
    ['other-page-warning', 1],
    ['delayed-redirect', 1],
    ['click-ack-loss', 1],
    ['session-warning', 2]
  ]) {
    const warning = browserFactory(username);
    instances.push(warning);
    await warning.initializeBrowser(
      { username, password: 'fixture' },
      true,
      true
    );
    assert.equal(
      attempts.get(String(nextSession)),
      expectedAttempts,
      'resubmit only while the browser is still on Default.aspx'
    );
    assert.equal(warning.isLoggedIn(), true);
    assert.equal(warning.isLoggingIn(), false);
    assert.equal(await warning.companyName(), 'fixture');
    assert.equal(protectedPageVisits.has(String(nextSession)), false);
    assert(
      warning
        .getPage()
        .url()
        .includes('/LoginLanding.aspx')
    );
    await warning.disconnect();
  }
  console.log(
    'PASS: same-page-only retries, other-page warnings, delayed redirects and click acknowledgement loss'
  );

  const outsideError = browserFactory('outside-http-error');
  instances.push(outsideError);
  await assert.rejects(
    outsideError.initializeBrowser(
      { username: 'outside-http-error', password: 'fixture' },
      true,
      true
    ),
    /HTTP 503/
  );
  assert.equal(attempts.get(String(nextSession)), 1);
  assert.equal(outsideError.isLoggedIn(), false);
  await outsideError.disconnect();
  console.log(
    'PASS: errors after leaving the login page never resubmit credentials'
  );

  const popup = browserFactory('session-warning-popup');
  instances.push(popup);
  const popupCredentials = {
    username: 'session-warning-popup',
    password: 'fixture'
  };
  await popup.initializeBrowser(popupCredentials, true, false);
  await popup.getPage().goto('https://i3ms.odishaminerals.gov.in/Default.aspx');
  const cookie = (await popup.getPage().cookies()).find(
    value => value.name === 'fixtureSession'
  );
  authenticatedSessions.add(cookie.value);
  await popup.initializeBrowser(popupCredentials, true, true);
  assert.equal(popup.isLoggedIn(), true);
  assert.equal(await popup.companyName(), 'fixture');
  assert.equal(attempts.has(cookie.value), false);
  assert.equal(protectedPageVisits.has(cookie.value), false);
  assert(
    popup
      .getPage()
      .url()
      .includes('/LoginLanding.aspx')
  );
  console.log(
    'PASS: warning popup completes its redirect without a login restart or probe'
  );
  await popup.disconnect();

  const resume = browserFactory('resume-tagging-page');
  instances.push(resume);
  await resume.initializeBrowser(
    { username: 'session-warning-direct', password: 'fixture' },
    true,
    false
  );
  await resume
    .getPage()
    .goto('https://i3ms.odishaminerals.gov.in/Default.aspx');
  const resumeCookie = (await resume.getPage().cookies()).find(
    value => value.name === 'fixtureSession'
  );
  const requestedUrl =
    'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx?fixture=resume';
  assert.deepEqual(await resume.gotoTagPage(requestedUrl), {});
  assert.equal(resume.isLoggedIn(), true);
  assert.equal(attempts.get(resumeCookie.value), 1);
  assert.equal(taggingPageVisits.get(resumeCookie.value), 2);
  assert.equal(protectedPageVisits.has(resumeCookie.value), false);
  assert(
    resume
      .getPage()
      .url()
      .endsWith('/TransporterAssignVehicleNew.aspx?fixture=resume')
  );
  console.log(
    'PASS: login warning resumes the requested tagging URL without dashboard or duplicate reload'
  );
  await resume.disconnect();

  const watcher = browserFactory('permit-watcher');
  instances.push(watcher);
  const initializeWatcher = watcher.initializeBrowser;
  watcher.initializeBrowser = async (...args) => {
    await initializeWatcher(...args);
    watchedSession = (await watcher.getPage().cookies()).find(
      cookie => cookie.name === 'fixtureSession'
    ).value;
    watchActive = true;
  };
  const polls = [];
  try {
    const monitorApi = loadMonitorApi(watcher);
    await monitorApi.newPermits(credentials, false, {
      isDestroyed: () => watchStopped,
      send: (event, data) => {
        assert.equal(event, 'new-permits');
        polls.push(data);
        // Exercise renewal without changing the existing login policy.
        if (polls.length === 1) authenticatedSessions.delete(watchedSession);
        if (polls.length === 2) watchStopped = true;
      }
    });
    assert.deepEqual(
      watchWaits,
      [5000],
      'wait five seconds between permit polls'
    );
    assert.equal(watchReads, 2);
    assert.equal(watchReloads, 0, 'legacy polling navigates back from details');
    assert.equal(
      watchDetailRequests,
      4,
      'fetch both permit detail pages on each poll'
    );
    assert.equal(
      attempts.get(watchedSession),
      4,
      'renew only the expired session'
    );
    assert.deepEqual(
      polls.map(rows => rows.map(row => row.name)),
      [
        ['WATCH-1', 'DERIVED'],
        ['WATCH-2', 'DERIVED']
      ]
    );
    for (const batch of polls) {
      for (const permit of batch) {
        assert.equal(
          permit.source,
          'MINE',
          'read Requested By from the detail grid'
        );
        assert.equal(
          permit.transportedFrom,
          'PIT A',
          'location is absent from the list but present in details'
        );
        assert.equal(permit.quantity, 100);
      }
    }
    assert(polls[0][1].taggingUrl.endsWith('?name=DERIVED'));
    assert.equal(
      watcher.watchNewPermits,
      undefined,
      'the list-only watcher is removed'
    );
    assert(
      watchNavigations.every(path =>
        /ViewTransporterAction|VehicleDetails|Default/.test(path)
      ),
      'no release or trip reports during auto discovery'
    );
    assert.equal(
      watchLogs.filter(args => args.includes('last two month permits called'))
        .length,
      2
    );
    console.log(
      'PASS: legacy discovery extracts Requested By and Transported From from actual detail pages, including session renewal'
    );

    await require('./testAutoTagging').formTests(polls[0][0], [
      {
        name: 'location-rule',
        source: 'Mine',
        transportedFrom: 'Pit A',
        truckList: 'trucks',
        priority: '1'
      }
    ]);
    console.log(
      'PASS: real permit details satisfy the location rule and dispatch the correct tagging job'
    );
  } finally {
    watchStopped = true;
    watchActive = false;
    await watcher.disconnect();
  }

  const held = browserFactory('held');
  const queued = browserFactory('queued');
  instances.push(held, queued);
  const heldReady = held.initializeBrowser(
    { username: 'held-login', password: 'fixture' },
    true,
    true
  );
  heldReady.catch(() => {});
  await heldLogin;
  assert.equal(
    held.isLoggingIn(),
    true,
    'expose active login to the tagging watchdog'
  );
  const queuedReady = queued.initializeBrowser(credentials, true, true);
  const queuedStopped = assert.rejects(queuedReady, /login stopped/);
  // Wait for form preparation, then stop while this browser is queued.
  while (
    !queued.getPage() ||
    (await queued
      .getPage()
      .$eval('#txtpwd', el => el.value)
      .catch(() => null)) !== credentials.password
  ) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  // Drain the fill continuation so submitLogin has entered the held queue.
  await new Promise(resolve => setImmediate(resolve));
  await queued.disconnect();
  releaseHeldLogin();
  await heldReady;
  assert.equal(held.isLoggingIn(), false);
  await queuedStopped;
  assert.equal(
    attempts.has(String(nextSession)),
    false,
    'stopped queued browser must not submit'
  );
  console.log('PASS: queued login cancels on disconnect');
}

let timeout;
Promise.race([
  run(),
  new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Login regression test timed out')),
      60000
    );
  })
])
  .catch(ex => {
    console.error(ex);
    process.exitCode = 1;
  })
  .finally(async () => {
    fixtureStopped = true;
    clearTimeout(timeout);
    await Promise.all(
      instances.map(instance => instance.disconnect().catch(() => {}))
    );
    await Promise.all(
      realBrowsers.map(browser => browser.close().catch(() => {}))
    );
    await new Promise(resolve => server.close(resolve));
  });
