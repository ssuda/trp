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
let releaseHeldLogin;
let heldLoginStarted;
const heldLogin = new Promise(resolve => {
  heldLoginStarted = resolve;
});

const form = message => `<!doctype html><html><body>
  <form method="post"><input id="txtusr" name="username">
  <input id="txtpwd" name="password" type="password">
  <button id="btnSubmit" type="submit">Login</button>
  <span id="lblMsg">${message || ''}</span></form></body></html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const session = (request.headers.cookie || '').match(/fixtureSession=(\d+)/);
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
          response.writeHead(302, { Location: '/DASHBOARD_TR.aspx' });
          response.end();
        }
      };
      if (username === 'held-login') {
        // This case succeeds on the first submit once the test releases it.
        attempts.set(key, 3);
        releaseHeldLogin = () => {
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

  if (/\/Dashboard_TR\.aspx/i.test(url.pathname)) {
    // Include a real response-body delay: login must await DOM readiness.
    response.writeHead(200, { 'Content-Type': 'text/html' });
    setTimeout(() => {
      activeSubmissions--;
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

  const factory = new Module(browserFile, module);
  factory.paths = Module._nodeModulePaths(path.dirname(browserFile));
  const normalRequire = factory.require.bind(factory);
  factory.require = name => {
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
          return goto(
            `http://127.0.0.1:${port}${destination.pathname}${destination.search}`,
            settings
          );
        };
        const waitForNavigation = page.waitForNavigation.bind(page);
        page.waitForNavigation = settings => {
          navigationOptions.push(settings);
          return waitForNavigation(settings);
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
  factory._compile(source, browserFile);
  return factory.exports;
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
      12000
    );
  })
])
  .catch(ex => {
    console.error(ex);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(timeout);
    await Promise.all(
      instances.map(instance => instance.disconnect().catch(() => {}))
    );
    await Promise.all(
      realBrowsers.map(browser => browser.close().catch(() => {}))
    );
    await new Promise(resolve => server.close(resolve));
  });
