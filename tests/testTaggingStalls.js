// Run with node tests/testTaggingStalls.js. Virtual time exercises the real
// queue and watchdog without portal requests, OCR, or a two-minute sleep.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { execFileSync } = require('child_process');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');
const flush = async (count = 100) => {
  for (let i = 0; i < count; i++) await Promise.resolve();
};
const pending = () => new Promise(() => {});
const options = {
  name: 'FIXTURE',
  taggingUrl: 'https://example.invalid/fixture',
  credentials: { username: 'fixture', password: 'fixture' },
  numBrowsers: 1,
  showBrowser: false
};

function fixture({ onTag, onInitialize, onClose, onVerify } = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const clock = {
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    advance: async milliseconds => {
      const target = now + milliseconds;
      await flush();
      while (timers.size) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = target;
      await flush();
    }
  };
  const logs = [];
  const quietConsole = {
    log: (...args) => logs.push(args),
    error: (...args) => logs.push(args)
  };
  function load(relative, overrides = {}, source) {
    const filename = path.join(root, relative);
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = name =>
      name === 'fixture-clock'
        ? clock
        : name === 'fixture-console'
        ? quietConsole
        : Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name]
        : originalRequire(name);
    loaded._compile(
      `const { Date, setTimeout, clearTimeout } = require('fixture-clock');
      const console = require('fixture-console');
      ${
        transformSync(source || fs.readFileSync(filename, 'utf8'), {
          configFile: false,
          babelrc: false,
          plugins: ['@babel/plugin-transform-modules-commonjs']
        }).code
      }`,
      filename
    );
    return loaded.exports;
  }
  const generations = new Map();
  const instances = [];
  const claims = [];
  const confirmed = new Set();
  const factory = tabNo => {
    if (tabNo === undefined) return {};
    const generation = (generations.get(tabNo) || 0) + 1;
    generations.set(tabNo, generation);
    const tab = {
      tabNo,
      generation,
      connected: true,
      loggedIn: false,
      loggingIn: false,
      closed: 0,
      killed: 0,
      getBrowser: () =>
        tab.connected
          ? {
              isConnected: () => tab.connected,
              process: () => ({
                kill: () => {
                  tab.killed++;
                  tab.connected = false;
                }
              })
            }
          : null,
      getPage: () => ({ isClosed: () => !tab.connected }),
      isLoggedIn: () => tab.loggedIn,
      isLoggingIn: () => tab.loggingIn,
      initializeBrowser: async () => {
        tab.loggingIn = true;
        if (onInitialize) await onInitialize(tab);
        tab.loggingIn = false;
        tab.loggedIn = true;
      },
      disconnect: async () => {
        tab.closed++;
        tab.loggedIn = false;
        if (onClose) await onClose(tab);
        tab.connected = false;
      },
      gotoTagPage: async () => ({}),
      tagVehicle: async (url, truck) => {
        claims.push({ truck, tab });
        const result = onTag
          ? await onTag(tab, truck)
          : { name: 'FIXTURE', reason: '' };
        if (result.reason === '') confirmed.add(truck);
        return result;
      },
      releasePage: async () => (onVerify ? onVerify(tab) : [...confirmed])
    };
    instances.push(tab);
    return tab;
  };
  const source = process.argv.includes('--baseline')
    ? execFileSync('git', ['show', 'HEAD:api/index.js'], {
        cwd: root,
        encoding: 'utf8'
      })
    : undefined;
  const api = load(
    'api/index.js',
    {
      './browser': factory,
      './utils': load('api/utils.js'),
      'console-stamp': () => {}
    },
    source
  );
  const events = [];
  const renderer = { send: (event, data) => events.push({ event, data }) };
  const results = () => events.filter(entry => entry.event === 'tag-result');
  return {
    api,
    clock,
    timers,
    instances,
    claims,
    factory,
    renderer,
    results,
    logs
  };
}

async function watchdogTests() {
  let resolveLate;
  const f = fixture({
    onTag: () =>
      new Promise(resolve => {
        resolveLate = resolve;
      })
  });
  const tab = f.factory(0);
  await tab.initializeBrowser();
  let ended = false;
  const task = f.api
    .tagging(tab, ['STALLED'], options, f.renderer, 0)
    .then(() => {
      ended = true;
    });
  await f.clock.advance(119000);
  assert.equal(ended, false);
  await f.clock.advance(1000);
  assert.equal(ended, true, 'a hung browser call must stop at its deadline');
  await task;
  assert.equal(tab.closed, 1);
  assert.match(f.results()[0].data.truck.STALLED, /unconfirmed/);
  resolveLate({ name: 'FIXTURE', reason: '' });
  await flush();
  assert.equal(
    f.results().length,
    1,
    'late success must not overwrite the unconfirmed result'
  );
  assert.equal(f.timers.size, 0);
  console.log(
    'PASS: stuck truck deadline, browser retirement and stale result suppression'
  );

  let finishAfterLogin;
  const renewing = fixture({
    onTag: () =>
      new Promise(resolve => {
        finishAfterLogin = resolve;
      })
  });
  const session = renewing.factory(0);
  await session.initializeBrowser();
  session.loggingIn = true;
  const renewal = renewing.api.tagging(
    session,
    ['RENEWAL'],
    options,
    renewing.renderer,
    0
  );
  await renewing.clock.advance(180000);
  assert.equal(
    session.closed,
    0,
    'the tagging watchdog must not cancel a three-minute login'
  );
  assert.equal(renewing.results().length, 0);
  session.loggingIn = false;
  await renewing.clock.advance(119000);
  finishAfterLogin({ name: 'FIXTURE', reason: '' });
  await renewal;
  assert.equal(renewing.results()[0].data.truck.RENEWAL, '');
  assert.equal(renewing.timers.size, 0);
  console.log('PASS: login renewal is excluded from the per-truck deadline');

  const closing = fixture({ onTag: pending, onClose: pending });
  const blocked = closing.factory(0);
  await blocked.initializeBrowser();
  let closed = false;
  const closeTask = closing.api
    .tagging(blocked, ['CLOSE'], options, closing.renderer, 0)
    .then(() => {
      closed = true;
    });
  await closing.clock.advance(120000);
  assert.equal(closed, false);
  await closing.clock.advance(5000);
  await closeTask;
  assert.equal(closed, true);
  assert.equal(
    blocked.killed,
    1,
    'kill only the owned Chromium process if close hangs'
  );
  assert.equal(closing.results().length, 1);
  console.log('PASS: an unresponsive browser close cannot block recovery');
}

async function queueTests() {
  const replacement = fixture({
    onTag: tab =>
      tab.generation === 1 ? pending() : { name: 'FIXTURE', reason: '' }
  });
  let replaced = false;
  const replacementTask = replacement.api
    .tagVehicles(
      { ...options, trucks: ['STUCK', 'NEXT', 'LAST'] },
      replacement.renderer
    )
    .then(() => {
      replaced = true;
    });
  await flush(500);
  await replacement.clock.advance(120000);
  assert.equal(replaced, true, 'replace a stuck worker when trucks remain');
  await replacementTask;
  assert.deepEqual(
    replacement.claims.map(claim => claim.tab.generation),
    [1, 2, 2]
  );
  assert.equal(
    replacement.instances[0].closed,
    1,
    'close the old browser before giving the next truck to a new one'
  );
  assert.equal(replacement.results().length, 3);
  console.log(
    'PASS: a single stalled browser is replaced and the remaining queue continues'
  );

  const last = fixture({
    onTag: async tab => {
      tab.connected = false;
      return { name: 'FIXTURE', reason: 'fixture disconnect' };
    },
    onInitialize: tab => (tab.generation > 1 ? pending() : undefined)
  });
  let complete = false;
  const lastTask = last.api
    .tagVehicles({ ...options, trucks: ['LAST'] }, last.renderer)
    .then(() => {
      complete = true;
    });
  await flush(500);
  assert.equal(
    complete,
    true,
    'the last truck must not wait for a needless login'
  );
  await lastTask;
  assert.equal(last.instances.length, 1);
  assert.equal(last.results().length, 1);
  console.log('PASS: a last-truck disconnect does not wedge job completion');

  const mixed = fixture({
    onTag: tab =>
      tab.tabNo === 0 ? pending() : { name: 'FIXTURE', reason: '' }
  });
  await mixed.api.openTabs(2, options.credentials, true);
  await flush();
  const trucks = Array.from({ length: 12 }, (_, i) => `TRUCK-${i}`);
  let mixedDone = false;
  const mixedTask = mixed.api
    .tagVehicles({ ...options, numBrowsers: 2, trucks }, mixed.renderer)
    .then(() => {
      mixedDone = true;
    });
  await flush(1000);
  assert.equal(
    mixedDone,
    false,
    'wait for the claimed truck, not just the empty queue'
  );
  assert.equal(
    mixed.claims.length,
    trucks.length,
    'healthy workers keep taking remaining trucks'
  );
  await mixed.clock.advance(120000);
  await mixedTask;
  assert.equal(mixed.results().length, trucks.length);
  assert.equal(
    new Set(mixed.claims.map(claim => claim.truck)).size,
    trucks.length
  );
  assert.equal(mixed.instances[0].closed, 1);
  console.log(
    'PASS: a stalled worker does not block healthy browsers or duplicate truck claims'
  );

  let allowHealthy;
  const recoveryStarted = new Promise(resolve => {
    allowHealthy = resolve;
  });
  const recovering = fixture({
    onInitialize: tab => {
      if (tab.tabNo === 0 && tab.generation > 1) {
        allowHealthy();
        return pending();
      }
    },
    onTag: async tab => {
      if (tab.tabNo === 0) {
        tab.connected = false;
        return { name: 'FIXTURE', reason: 'fixture disconnect' };
      }
      await recoveryStarted;
      return { name: 'FIXTURE', reason: '' };
    }
  });
  await recovering.api.openTabs(2, options.credentials, true);
  await flush();
  let recoveredDone = false;
  const recoveringTask = recovering.api
    .tagVehicles({ ...options, numBrowsers: 2, trucks }, recovering.renderer)
    .then(() => {
      recoveredDone = true;
    });
  await flush(1000);
  assert.equal(
    recoveredDone,
    true,
    'a background recovery login must not hold a completed job'
  );
  await recoveringTask;
  assert.equal(recovering.results().length, trucks.length);
  assert.equal(recovering.instances[2].loggingIn, true);
  console.log(
    'PASS: completion ignores recovery login after other workers finish the queue'
  );

  const verification = fixture({ onVerify: pending, onClose: pending });
  let verified = false;
  const verificationTask = verification.api
    .tagVehicles({ ...options, trucks: ['VERIFY'] }, verification.renderer)
    .then(() => {
      verified = true;
    });
  await flush(500);
  await verification.clock.advance(90000);
  assert.equal(verified, false);
  await verification.clock.advance(5000);
  await verificationTask;
  assert.equal(verified, true);
  assert.equal(verification.instances[0].killed, 1);
  console.log(
    'PASS: final verification and browser close both have bounded waits'
  );
}

(async () => {
  await watchdogTests();
  await queueTests();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
