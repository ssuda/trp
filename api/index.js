const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
require('console-stamp')(console, '[HH:MM:ss.l]');

const browser = require('./browser');
const captchaOcr = require('./tessaract');

const i3ms = browser();
const _ = require('lodash');

const { delay, promiseWithTimeout } = require('./utils');

export let busyFlag = {
  isBusy: false
};

//export methods
let newPermitBrowser;

// How often a fresh "look" for new permits should START. The previous fixed
// 5s sleep after every scrape made each look take ~10s. Pacing by period
// instead keeps a look roughly every NEW_PERMITS_LOOK_INTERVAL_MS (default
// 2s): if a scrape is slow, the next one starts immediately after a small
// floor instead of stacking a flat sleep on top of it.
const NEW_PERMITS_LOOK_INTERVAL_MS = Math.max(
  250,
  Number(process.env.NEW_PERMITS_LOOK_INTERVAL_MS) || 2000
);
const NEW_PERMITS_MIN_GAP_MS = 250;

// One look must never wedge the watcher: if the page/CDP hangs past this,
// the browser is disconnected so the supervisor can rebuild a fresh session.
const NEW_PERMITS_LOOK_TIMEOUT_MS = Math.max(
  30000,
  Number(process.env.NEW_PERMITS_LOOK_TIMEOUT_MS) || 90000
);

// Restart behavior when a watching session dies or fails to start. Auth
// failures are not retried because retrying cannot fix them.
const NEW_PERMITS_RESTART_MIN_MS = Math.max(
  1000,
  Number(process.env.NEW_PERMITS_RESTART_MIN_MS) || 5000
);
const NEW_PERMITS_RESTART_MAX_MS = 300000;
const NEW_PERMITS_HEALTHY_SESSION_MS = 60000;

let newPermitWatcherRunning = false;
// Always points at the latest renderer so a window reload does not leave the
// watcher streaming into a destroyed event sender.
let newPermitSse;

function isAuthError(ex) {
  return /password is incorrect/i.test((ex && ex.message) || '');
}

async function runNewPermitsWatcher(credentials, showBrowser) {
  newPermitBrowser = browser();

  let toExit = false;

  const disconnectHandler = () => {
    toExit = true;
  };
  await newPermitBrowser.initializeBrowser(
    credentials,
    !showBrowser,
    true,
    disconnectHandler
  );

  while (!toExit && tabReady(newPermitBrowser)) {
    const lookStartedAt = Date.now();
    let out = [];
    let lookTimedOut = false;
    try {
      out = await promiseWithTimeout(
        twoMonthPermits(
          {
            onlyNewPermits: true
          },
          null,
          newPermitBrowser
        ),
        NEW_PERMITS_LOOK_TIMEOUT_MS
      );

      console.log('New permits', out);
      if (newPermitSse) {
        newPermitSse.send('new-permits', out);
      }
    } catch (ex) {
      console.error('New permit look failed:', ex.message);
      lookTimedOut = /^Request timed out$/i.test(ex.message || '');
      if (lookTimedOut && newPermitBrowser) {
        // The page or connection is wedged; drop it so the watcher session
        // ends and the supervisor starts a clean one.
        await newPermitBrowser.disconnect().catch(() => {});
      }
    }

    if (!tabReady(newPermitBrowser)) {
      break;
    }

    const lookDuration = Date.now() - lookStartedAt;
    console.log(`Look for new permits took ${lookDuration}ms`);

    // Start the next look every NEW_PERMITS_LOOK_INTERVAL_MS; only idle for
    // whatever is left of that budget (never less than NEW_PERMITS_MIN_GAP_MS).
    await delay(
      Math.max(
        NEW_PERMITS_MIN_GAP_MS,
        NEW_PERMITS_LOOK_INTERVAL_MS - lookDuration
      )
    );
  }
}

export async function newPermits(credentials, showBrowser, sse) {
  newPermitSse = sse;

  if (newPermitWatcherRunning) {
    return;
  }

  newPermitWatcherRunning = true;
  try {
    let restartDelay = NEW_PERMITS_RESTART_MIN_MS;

    for (;;) {
      const sessionStartedAt = Date.now();
      try {
        await runNewPermitsWatcher(credentials, showBrowser);
        console.error('New permit watcher stopped');
      } catch (ex) {
        console.error('New permit watcher crashed:', ex.message);
        if (isAuthError(ex)) {
          console.error(
            'Not restarting the new permit watcher: i3ms credentials are invalid'
          );
          return;
        }
      }

      if (!newPermitSse) {
        return;
      }

      // A session that ran healthily for a while resets the backoff; quick
      // consecutive crashes stretch it out up to NEW_PERMITS_RESTART_MAX_MS.
      if (Date.now() - sessionStartedAt >= NEW_PERMITS_HEALTHY_SESSION_MS) {
        restartDelay = NEW_PERMITS_RESTART_MIN_MS;
      } else {
        restartDelay = Math.min(restartDelay * 2, NEW_PERMITS_RESTART_MAX_MS);
      }

      console.error(`Restarting new permit watcher in ${restartDelay}ms`);
      await delay(restartDelay);
    }
  } finally {
    newPermitWatcherRunning = false;
    newPermitBrowser = null;
  }
}

let refreshBrowser;
export async function refreshPermits(args, sse) {
  if (refreshBrowser) {
    await refreshBrowser.disconnect();
  }

  refreshBrowser = browser();

  let toExit = false;
  const disconnectHandler = () => {
    toExit = true;
  };
  await refreshBrowser.initializeBrowser(
    args.credentials,
    true,
    true,
    disconnectHandler
  );

  let permits = args.permits || [];

  permits.forEach(permit => {
    CLOSED_PERMITS[permit.name] = permit.closed;
  });

  while (!toExit && tabReady(refreshBrowser)) {
    while (busyFlag.isBusy) {
      await delay(120000);
    }

    try {
      permits = await twoMonthPermits({}, sse, refreshBrowser);
    } catch (ex) {
      console.error(ex);
    }

    await delay(process.env.NODE_ENV === 'development' ? 600000 : 1800000);
  }
}

const CLOSED_PERMITS = {};

export async function twoMonthPermits(args, sse, browser = i3ms) {
  let permits = args.permits || [];

  permits = permits.map(p => {
    // Refresh all for Returns
    // if (args.i3msReturns) {
    //   CLOSED_PERMITS[p.name] = p.closed;
    // }
    return p.name;
  });

  let result = [];

  for (let attempts = 0; attempts < 3; ++attempts) {
    try {
      result = await browser.lastTwoMonthPermits(
        'https://i3ms.odishaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        !args.onlyNewPermits,
        args.onlyNewPermits,
        sse
      );
      break;
    } catch (ex) {
      // A silent catch here made "scrape failed" look identical to "no new
      // permits"; surface every attempt so stalls and failures are visible.
      console.error(
        `Fetching permits failed on attempt ${attempts + 1}/3:`,
        ex.message
      );
    }
  }

  const out = [];

  const lastMonth = moment()
    .subtract(1, 'months')
    .endOf('month');

  for (let permit of result) {
    if (!browser.getBrowser()) return Promise.resolve();

    if (/javascript/i.test(permit['Permit No.']) || !permit['Permit No.']) {
      continue;
    }

    if (CLOSED_PERMITS[permit['Permit No.']]) {
      continue;
    }

    if (args.i3msReturns || !permits.includes(permit['Permit No.'])) {
      const createdAt = moment(
        permit['Request On'] || permit['Requested On'],
        'DD MMM YYYY'
      );

      if (args.i3msReturns && createdAt.isAfter(lastMonth)) {
        continue;
      }

      const startDate = createdAt.local().format('YYYY-MM-DD');
      createdAt.add(1, 'month');
      const endDate = createdAt.local().format('YYYY-MM-DD');

      let pr = {
        name: permit['Permit No.'],
        startDate: startDate,
        endDate: endDate,
        circle: permit['Circle'],
        taggingUrl: permit['Tag New Vehicle'],
        vehicleDetails: permit['Vehicle Details'],
        source: permit['Lessee/Licensee Name'],
        noTrips: args.onlyNewPermits,
        noTagged: args.onlyNewPermits
      };

      if (!pr.taggingUrl) {
        const uri = new URL(pr.vehicleDetails);
        pr.taggingUrl =
          'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
          uri.search;
      }

      if (args.onlyNewPermits && pr.taggingUrl) {
        continue;
      }

      if (pr.taggingUrl) {
        try {
          const l = await getPermit(pr, sse, browser);
          out.push(l);
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  }

  return out;
}

export async function permitTrips(args, sse, browser = i3ms) {
  let fromDate = moment(args.startDate).format('DD-MMM-YYYY');
  let toDate = moment(args.endDate).format('DD-MMM-YYYY');

  let retries = 0;

  while (retries < 3) {
    try {
      let r = await browser.permitVehicles(
        'https://i3ms.odishaminerals.gov.in/i3MS/ePassReports/PermitWiseTransportDetails.aspx?linkn=313&linkm=15&Openstate=0',
        args.name,
        fromDate,
        toDate
      );

      let trips = r.trucks.filter(t => t['Pass Number']);

      trips = _.map(trips, tpDetails => {
        let uom;
        let wt;
        _.each(tpDetails, (v, k) => {
          if (/mineral quantity/i.test(k)) {
            wt = v;
            uom = k.substring(k.lastIndexOf('(') + 1, k.lastIndexOf(')'));
            uom = uom.replace(/in /i, '');
          }
        });

        return {
          tp_date: tpDetails['Pass Date'],
          tp_number: tpDetails['Pass Number Text'],
          tp_url: tpDetails['Pass Number'],
          truck_number: tpDetails['Truck Number'],
          load_carrying: parseFloat(wt)
        };
      });

      delete r.trucks;
      r.trips = trips;

      return r;
    } catch (ex) {
      retries++;
    }
  }
}

async function successfullyTagged(permitNo, credentials, browser = i3ms) {
  if (credentials) {
    await browser.initializeBrowser(credentials, true);
  }

  if (/^http/i.test(permitNo)) {
    const t = await browser.gotoTagPage(permitNo);
    permitNo = t['Permit No.'];
  }

  const v = await browser.releasePage(
    'https://i3ms.odishaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
    permitNo
  );

  return v.reduce((p, t) => {
    p[t] = '';
    return p;
  }, {});
}

export async function getPermit(permit, sse, browser = i3ms) {
  let {
    taggingUrl,
    vehicleDetails,
    name: permitNumber,
    source,
    startDate,
    endDate,
    noTrips,
    noTagged,
    quantity,
    material,
    destination,
    validate,
    transportedFrom
  } = permit;

  if (!quantity || !destination || !transportedFrom || !taggingUrl) {
    if (taggingUrl && !vehicleDetails) {
      const u = new URL(taggingUrl);
      vehicleDetails =
        'https://i3ms.odishaminerals.gov.in/i3ms/pms/VehicleDetails.aspx' +
        u.search;
    }

    const r = await browser.permitDetails(vehicleDetails);

    if (!permitNumber) {
      permitNumber = r['Permit No.'];
    }

    if (validate) {
      let result = await browser.lastTwoMonthPermits(
        'https://i3ms.odishaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        true
      );

      let found = false;
      for (let i = 0; i < result.length; ++i) {
        if (result[i]['Permit No.'] == permitNumber) {
          found = true;
          break;
        }
      }

      if (!found && sse) {
        sse.send('permit-details-results', null);
        return null;
      }
    }

    if (!startDate) {
      startDate = moment(r['Requested On'], 'DD MMM YYYY')
        .local()
        .format('YYYY-MM-DD');
    }

    if (!source) {
      source = r['Requested By'];
    }

    if (!transportedFrom) {
      transportedFrom = r['Transported From'];
    }

    if (r['Permit Qty.']) {
      quantity = parseFloat(r['Permit Qty.'].replace(/[^\d\.]/g, ''));
    }

    const validity = r['Permit Validity'] || '';

    if (validity) {
      endDate = moment(validity, 'DD MMM YYYY')
        .local()
        .format('YYYY-MM-DD');
    }
  }

  permit = {
    name: permitNumber,
    transportedFrom,
    source,
    quantity,
    startDate,
    taggingUrl,
    vehicleDetails,
    endDate
  };

  if (!noTagged) {
    permit.tagged = await successfullyTagged(permitNumber, null, browser);
  } else {
    permit.tagged = {};
  }

  if (!noTrips) {
    let reportResult = await permitTrips(permit, sse, browser);

    if (!permit.material) {
      permit.material = reportResult['Mineral Name'];
    }

    if (!permit.destination) {
      permit.destination = reportResult['Destination'];
    }

    if (!permit.transportedFrom) {
      permit.transportedFrom = reportResult['Name Of Consigner'];
    }

    // if (!permit.consignee) {
    //   permit.consignee = reportResult['Name Of Consignee'];
    // }

    if (!permit.quantity) {
      permit.quantity = parseFloat(
        (reportResult['Permit Quantity'] || '').replace(/[^\d\.]/g, '')
      );
    }

    permit.trips = reportResult.trips;
    //check whether there no trips for in last one week
    const latestTrip = permit.trips.reduce((p, trip) => {
      const d = moment(trip.tp_date, [
        'MM/DD/YYYY hh:mm:ss A',
        'DD MMM YYYY'
      ]).toDate();

      if (p > d.getTime()) {
        return p;
      }

      return d.getTime();
    }, 0);

    if (latestTrip) {
      const now = +new Date();

      console.log(
        'latest trip',
        permit.name,
        latestTrip,
        now,
        (now - latestTrip) / 1000 > 7 * 24 * 3600
      );

      if ((now - latestTrip) / 1000 > 7 * 24 * 3600) {
        permit.closed = 1;
        CLOSED_PERMITS[permit.name] = 1;
      } else {
        permit.closed = 0;
        CLOSED_PERMITS[permit.name] = 0;
      }
    }
  } else {
    permit.trips = [];
  }

  if (sse) {
    sse.send(
      'permit-details-results',
      _.omit(permit, ['sender', 'credentials'])
    );
  }

  return permit;
}

export async function tagging(tab, vehicles, options, renderer, tabNo) {
  const { taggingUrl } = options;

  if (!Array.isArray(vehicles) || !vehicles.length) {
    return;
  }

  for (let count = 0; count < vehicles.length; ) {
    if (!tabReady(tab)) {
      for (; count < vehicles.length; count++) {
        sendTagFailure(
          renderer,
          options,
          vehicles[count],
          'Tagging browser disconnected'
        );
      }
      break;
    }

    let truck = vehicles[count];

    console.log('Tab', tabNo, 'tagging vehicle', count);
    try {
      let { reason, name } = await tab.tagVehicle(truck, renderer, options);

      console.log('Tab', tabNo, 'tagged vehicle', count, reason);

      if (reason && /is already tagged/i.test(reason)) {
        reason = 'Already Tagged by SomeOne';
      }

      if (renderer) {
        renderer.send('total', 1);
      }

      if (reason) {
        if (renderer) {
          renderer.send('failed', 1);
        }
      }

      if (renderer && (reason || reason === '')) {
        renderer.send('tag-result', {
          name,
          taggingUrl,
          truck: {
            [truck]: reason
          }
        });
      }
      count++;
    } catch (ex) {
      console.log('Tab', tabNo, 'tagged vehicle', count, ex.message);
      try {
        await tab.gotoTagPage(taggingUrl);
      } catch (e) {
        console.error('Tab', tabNo, 'Failed resetting page:', e.message);
      }

      sendTagFailure(renderer, options, truck, ex.message || 'Tagging failed');
      count++;
    }
  }

  console.log('Tab', tabNo, 'Tagging ended');
}

function sendTagFailure(renderer, options, truck, reason) {
  if (!renderer || typeof renderer.send !== 'function') {
    return;
  }

  renderer.send('total', 1);
  renderer.send('failed', 1);
  renderer.send('tag-result', {
    name: (options && options.name) || '',
    taggingUrl: options && options.taggingUrl,
    truck: {
      [truck]: reason
    }
  });
}

let tabs = [];
let tabsReady = Promise.resolve();
let taggingCredentials;
let taggingHeadless;
let lastPoolSize = 10;
const tabRecoveryPromises = new Map();

// --- Warm browser pool -----------------------------------------------------
// The pool is opened as soon as the app has i3ms credentials (renderer sends
// 'open-tabs' on login) and every tagging request reuses it instead of paying
// N fresh logins. Idle tabs are reloaded before the i3ms ASP.NET session can
// expire so a request never starts from a dead session.

const TAB_KEEP_ALIVE_TICK_MS = 30000;
const TAB_KEEP_ALIVE_IDLE_MS = Math.max(
  60000,
  Number(process.env.TAG_KEEP_ALIVE_IDLE_MS) || 240000
);

let poolKeepAliveTimer;

// Per-tab liveness: 'busy' keeps the keep-alive loop away from a tab that is
// preparing or actively tagging; lastUsedAt decides when it needs a refresh.
const tabRuntime = new Map();

function runtimeFor(tabNo) {
  let runtime = tabRuntime.get(tabNo);
  if (!runtime) {
    runtime = { busy: false, lastUsedAt: Date.now() };
    tabRuntime.set(tabNo, runtime);
  }
  return runtime;
}

function markTabBusy(tabNo, busy) {
  runtimeFor(tabNo).busy = busy;
}

function touchTab(tabNo) {
  runtimeFor(tabNo).lastUsedAt = Date.now();
}

function startPoolKeepAlive() {
  if (poolKeepAliveTimer) {
    return;
  }
  poolKeepAliveTimer = setInterval(() => {
    (async () => {
      for (const [tabNo, tab] of tabs.entries()) {
        if (!tabReady(tab)) {
          continue;
        }
        const runtime = runtimeFor(tabNo);
        if (
          runtime.busy ||
          Date.now() - runtime.lastUsedAt < TAB_KEEP_ALIVE_IDLE_MS
        ) {
          continue;
        }
        runtime.lastUsedAt = Date.now();
        console.log('Keep-alive refreshing tagging page', tabNo);
        await tab.keepAlivePage().catch(ex => {
          console.error('Keep-alive failed for page', tabNo, ex.message);
        });
      }
    })().catch(ex => console.error('Keep-alive tick failed:', ex.message));
  }, TAB_KEEP_ALIVE_TICK_MS);
  if (poolKeepAliveTimer.unref) {
    poolKeepAliveTimer.unref();
  }
}

function stopPoolKeepAlive() {
  if (poolKeepAliveTimer) {
    clearInterval(poolKeepAliveTimer);
    poolKeepAliveTimer = null;
  }
}

function browserConnected(instance) {
  const instanceBrowser = instance && instance.getBrowser();
  return Boolean(
    instanceBrowser &&
      (typeof instanceBrowser.isConnected !== 'function' ||
        instanceBrowser.isConnected())
  );
}

function tabReady(tab) {
  const tabPage = tab && tab.getPage();
  return Boolean(
    browserConnected(tab) &&
      tabPage &&
      (typeof tabPage.isClosed !== 'function' || !tabPage.isClosed())
  );
}

function sameCredentials(first, second) {
  return Boolean(
    first &&
      second &&
      first.username === second.username &&
      first.password === second.password
  );
}

async function resetTabs() {
  const oldTabs = tabs;
  tabs = [];
  taggingCredentials = null;
  taggingHeadless = undefined;

  await Promise.all(
    oldTabs.map(tab => (tab ? tab.disconnect().catch(() => {}) : null))
  );
}

export async function setTaggingBrowserVisibility(showBrowser) {
  const desiredHeadless = !showBrowser;

  await tabsReady.catch(() => {});
  if (tabs.some(tabReady) && taggingHeadless !== desiredHeadless) {
    const credentials = taggingCredentials;
    await resetTabs();
    tabsReady = Promise.resolve([]);
    // Rewarm the pool in the new mode right away instead of leaving the next
    // tagging request to pay for a cold start.
    if (credentials && credentials.username) {
      startTaggingPool({
        credentials,
        numBrowsers: lastPoolSize,
        showBrowser
      }).catch(ex => {
        console.error('Unable to rewarm tagging pool:', ex.message);
      });
    }
  }
}

async function openTab(tabNo, credentials, headless) {
  const tab = browser(tabNo);
  tabs[tabNo] = tab;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log('Tab', tabNo, `browser login cycle ${attempt}/2`);
      await tab.initializeBrowser(credentials, headless, !!credentials);
      return true;
    } catch (ex) {
      console.error(
        'Tab',
        tabNo,
        `failed to initialize on cycle ${attempt}/2:`,
        ex.message
      );
      await tab.disconnect().catch(() => {});

      if (/password is incorrect/i.test(ex.message) || attempt >= 2) {
        break;
      }
      // Retry immediately — the disconnect above already tore down the bad
      // session, and the next cycle launches a fresh browser + login.
    }
  }

  return false;
}

export function openTabs(numTabs, credentials, headless = true) {
  console.log('open tabs called in api/index.js');
  const parsedNumTabs = Math.max(1, Math.floor(Number(numTabs) || 1));
  captchaOcr.setProcessLimit(parsedNumTabs);

  // Serialize pool mutations: startup warm-up, a credential change and a
  // tagging request can all call this; overlapping resets/launches would
  // corrupt the shared tabs[] array.
  tabsReady = tabsReady.then(() =>
    openMissingTabs(parsedNumTabs, credentials, headless)
  );
  tabsReady.catch(ex => {
    console.error('Unable to open tagging pages:', ex.message);
  });
  return tabsReady;
}

async function openMissingTabs(parsedNumTabs, credentials, headless) {
  const sessionNeedsRestart =
    !sameCredentials(taggingCredentials, credentials);

  if (sessionNeedsRestart) {
    await resetTabs();
  }

  taggingCredentials = {
    username: credentials && credentials.username,
    password: credentials && credentials.password
  };
  taggingHeadless = headless;
  lastPoolSize = parsedNumTabs;

  const results = await Promise.all(
    [...Array(parsedNumTabs).keys()].map(i => {
      if (tabReady(tabs[i])) {
        touchTab(i);
        return Promise.resolve(true);
      }
      return openTab(i, credentials, headless).then(opened => {
        if (opened) {
          touchTab(i);
        }
        return opened;
      });
    })
  );

  const ready = results.filter(Boolean).length;
  console.log(`Tagging pool ready: ${ready}/${parsedNumTabs} browsers`);
  startPoolKeepAlive();
  return results;
}

// Open the configured number of browsers, log them in and keep them warm.
// Idempotent: already-ready tabs with matching credentials/mode are reused.
export async function startTaggingPool(options = {}) {
  const { credentials } = options;
  if (!credentials || !credentials.username || !credentials.password) {
    console.error('Cannot start tagging pool: i3ms credentials are missing');
    return [];
  }

  const numBrowsers = Math.max(
    1,
    Math.floor(Number(options.numBrowsers) || 10)
  );
  const headless =
    options.showBrowser === undefined ? true : !options.showBrowser;

  await openTabs(numBrowsers, credentials, headless);
  return tabsReady;
}

// Tear everything down: pool tabs, the new-permit watcher, the refresh
// browser and the main instance. Called on app quit so no Chromium child
// processes are orphaned.
export async function shutdown() {
  stopPoolKeepAlive();

  newPermitSse = null;

  const oldTabs = tabs;
  tabs = [];
  taggingCredentials = null;
  taggingHeadless = undefined;
  tabRuntime.clear();
  tabRecoveryPromises.clear();

  await Promise.all(
    oldTabs.map(tab => (tab ? tab.disconnect().catch(() => {}) : null))
  );
  if (newPermitBrowser) {
    await newPermitBrowser.disconnect().catch(() => {});
    newPermitBrowser = null;
  }
  if (refreshBrowser) {
    await refreshBrowser.disconnect().catch(() => {});
    refreshBrowser = null;
  }
  await i3ms.disconnect().catch(() => {});
}

async function recoverTaggingTab(tabNo, options) {
  if (tabReady(tabs[tabNo])) {
    return tabs[tabNo];
  }

  if (tabRecoveryPromises.has(tabNo)) {
    return tabRecoveryPromises.get(tabNo);
  }

  const recovery = (async () => {
    const credentials = options.credentials;
    const headless = !options.showBrowser;
    const opened = await openTab(tabNo, credentials, headless);

    if (!opened || !tabReady(tabs[tabNo])) {
      throw new Error(`Unable to recover tagging page ${tabNo + 1}`);
    }

    console.log('Recovered tagging page', tabNo);
    return tabs[tabNo];
  })().finally(() => {
    tabRecoveryPromises.delete(tabNo);
  });

  tabRecoveryPromises.set(tabNo, recovery);
  return recovery;
}

async function tagOneVehicle(tab, truck, options, sse, tabNo) {
  if (!tabReady(tab)) {
    throw new Error('Tagging page is unavailable');
  }

  let { reason, name } = await promiseWithTimeout(
    tab.tagVehicle(truck, sse, options),
    tagVehicleTimeout()
  );

  if (!tabReady(tab)) {
    throw new Error('Tagging page closed while processing the vehicle');
  }

  console.log('Tab', tabNo, 'tagged vehicle', truck, reason);

  if (reason && /is already tagged/i.test(reason)) {
    reason = 'Already Tagged by SomeOne';
  }

  if (sse) {
    sse.send('total', 1);
    if (reason) {
      sse.send('failed', 1);
    }
    if (reason || reason === '') {
      sse.send('tag-result', {
        name,
        taggingUrl: options.taggingUrl,
        truck: {
          [truck]: reason
        }
      });
    }
  }
}

function tagVehicleTimeout() {
  const configured = Number(process.env.TAG_VEHICLE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 60000) {
    return Math.min(configured, 600000);
  }
  return 180000;
}

async function dynamicTagWorker(tabNo, nextTruck, options, sse) {
  let tab = tabs[tabNo];
  let pagePrepared = false;
  let preparationFailures = 0;

  for (;;) {
    // The keep-alive loop must never reload a tab while it is preparing or
    // actively tagging; the whole iteration runs with busy set.
    markTabBusy(tabNo, true);
    try {
      try {
        if (!tabReady(tab)) {
          tab = await recoverTaggingTab(tabNo, options);
          pagePrepared = false;
        }
        if (!pagePrepared) {
          await tab.gotoTagPage(options.taggingUrl);
          pagePrepared = true;
          touchTab(tabNo);
        }
      } catch (ex) {
        console.error('Tab', tabNo, 'cannot prepare tagging page:', ex.message);
        preparationFailures++;
        pagePrepared = false;
        if (tab) {
          await tab.disconnect().catch(() => {});
        }
        if (
          /password is incorrect/i.test(ex.message) ||
          preparationFailures >= 3
        ) {
          console.error(
            'Tab',
            tabNo,
            `stopping after ${preparationFailures} page preparation failures`
          );
          return;
        }
        await delay(1000 * preparationFailures);
        continue;
      }

      preparationFailures = 0;

      const truck = nextTruck();
      if (truck === undefined) {
        return;
      }

      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await tagOneVehicle(tab, truck, options, sse, tabNo);
          lastError = null;
          break;
        } catch (ex) {
          lastError = ex;
          pagePrepared = false;
          console.error(
            'Tab',
            tabNo,
            `vehicle ${truck} attempt ${attempt + 1}/2 failed:`,
            ex.message
          );

          const workerTimedOut = /^Request timed out$/i.test(ex.message || '');
          if (ex.tagSubmissionOutcomeUnknown || workerTimedOut) {
            if (workerTimedOut) {
              await tab.disconnect().catch(() => {});
            }
            console.error(
              'Tab',
              tabNo,
              `vehicle ${truck} was not retried because its submission outcome is unknown`
            );
            break;
          }

          if (/timed out/i.test(ex.message)) {
            await tab.disconnect().catch(() => {});
          }

          if (attempt < 1) {
            try {
              if (!tabReady(tab)) {
                tab = await recoverTaggingTab(tabNo, options);
              }
              await tab.gotoTagPage(options.taggingUrl);
              pagePrepared = true;
            } catch (recoveryError) {
              lastError = recoveryError;
              console.error(
                'Tab',
                tabNo,
                'failed to recover for retry:',
                recoveryError.message
              );
              break;
            }
          }
        }
      }

      if (lastError) {
        sendTagFailure(
          sse,
          options,
          truck,
          lastError.message || 'Tagging failed'
        );
      }
    } finally {
      markTabBusy(tabNo, false);
      touchTab(tabNo);
    }
  }
}

function finalTagVerificationTimeout() {
  const configured = Number(process.env.TAG_VERIFICATION_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5000) {
    return Math.min(configured, 120000);
  }
  return 45000;
}

async function tagFromTabs(taggingUrl, trucks, options, sse) {
  let taggingStarted = false;
  try {
    const requestedBrowsers = Math.max(
      1,
      Math.floor(Number(options.numBrowsers) || tabs.length || 10)
    );

    await tabsReady;

    const desiredHeadless =
      taggingHeadless !== undefined
        ? taggingHeadless
        : options.showBrowser === undefined
        ? true
        : !options.showBrowser;
    const credentialsMismatch = !sameCredentials(
      taggingCredentials,
      options.credentials
    );
    const readyBrowserCount = tabs.filter(tabReady).length;
    if (credentialsMismatch || readyBrowserCount < requestedBrowsers) {
      await openTabs(requestedBrowsers, options.credentials, desiredHeadless);
      await tabsReady;
    }

    const activeTabIndexes = tabs
      .map((tab, index) => (tabReady(tab) ? index : null))
      .filter(index => index !== null)
      .slice(0, Math.min(requestedBrowsers, trucks.length));
    const activeBrowserCount = activeTabIndexes.length;

    if (!activeBrowserCount) {
      throw new Error('No tagging browsers are available');
    }

    let nextTruckIndex = 0;
    const nextTruck = () => {
      if (nextTruckIndex >= trucks.length) {
        return undefined;
      }
      const truck = trucks[nextTruckIndex];
      nextTruckIndex++;
      return truck;
    };

    taggingStarted = true;
    await Promise.all(
      activeTabIndexes.map(tabNo =>
        dynamicTagWorker(tabNo, nextTruck, options, sse)
      )
    );

    while (nextTruckIndex < trucks.length) {
      sendTagFailure(
        sse,
        options,
        trucks[nextTruckIndex],
        'No tagging page remained available'
      );
      nextTruckIndex++;
    }

    // console.log('End of tagging');

    // if (!options.name) {
    //   console.log('Fetching permit');

    //   return getPermit(
    //     {
    //       taggingUrl: taggingUrl
    //     },
    //     sse,
    //     tabs[0]
    //   );
    // }

    console.log('Fetching Successfully Tagged', options.name);

    const verificationTabIndex = activeTabIndexes.find(index =>
      tabReady(tabs[index])
    );
    if (verificationTabIndex === undefined) {
      console.error('Skipping final tag verification: no page is available');
      return {};
    }

    let tagged;
    try {
      tagged = await promiseWithTimeout(
        successfullyTagged(options.name, null, tabs[verificationTabIndex]),
        finalTagVerificationTimeout()
      );
    } catch (verificationError) {
      console.error(
        'Final tag verification failed without blocking completion:',
        verificationError.message
      );
      if (/timed out/i.test(verificationError.message)) {
        await tabs[verificationTabIndex].disconnect().catch(() => {});
      }
      tagged = {};
    }

    // for (let i = 0; i < numTabs; ++i) {
    //   await tabs[i].disconnect();
    // }

    console.log('Complete End of Tagging');

    return tagged;
  } catch (ex) {
    console.error(ex);
    if (!taggingStarted) {
      trucks.forEach(truck => {
        sendTagFailure(sse, options, truck, ex.message || 'Tagging failed');
      });
    }
    return {};
  }
}

export async function tagVehicles(options, sse) {
  const { taggingUrl, trucks } = options;
  try {
    if (Array.isArray(trucks) && trucks.length) {
      return await tagFromTabs(taggingUrl, trucks, options, sse);
    }
    return {};
  } catch (ex) {
    console.error(ex);
    return {};
  }
}

export async function releaseVehicles(options, sse) {
  const { trucks, name: permitNumber } = options;
  try {
    if (trucks.length) {
      const chunks = _.chunk(trucks, 20);
      let tagged = [];

      for (let chunk of chunks) {
        tagged = await i3ms.releasePage(
          'https://i3ms.odishaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
          permitNumber,
          chunk
        );
      }

      return tagged.reduce((p, t) => {
        p[t] = '';
        return p;
      }, {});
    }
  } catch (ex) {
    console.error(ex);
  }
}

export function initializeBrowser(
  cred,
  headless,
  tologin,
  cb,
  returnCompanyName
) {
  return i3ms.initializeBrowser(cred, headless, tologin, cb, returnCompanyName);
}

export async function disconnect() {
  return i3ms.disconnect();
}

export async function companyName() {
  return i3ms.companyName();
}
