const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
require('console-stamp')(console, '[HH:MM:ss.l]');

const browser = require('./browser');
const captchaOcr = require('./tessaract');

const i3ms = browser();
const _ = require('lodash');

const { delay, promiseWithTimeout } = require('./utils');

const TAGGING_PAGE_TIMEOUT = 90000;
const TAGGING_TRUCK_TIMEOUT = 120000;
const TAGGING_LOGIN_TIMEOUT = 180000;

export let busyFlag = {
  isBusy: false,
  isTagging: false
};

//export methods
let newPermitBrowser;

export async function newPermits(credentials, showBrowser, sse) {
  if (newPermitBrowser) {
    return;
  }

  newPermitBrowser = browser();

  let toExit = false;

  await newPermitBrowser.initializeBrowser(
    credentials,
    !showBrowser,
    true,
    () => {
      toExit = true;
    }
  );

  while (!toExit) {
    while (busyFlag.isTagging && !toExit) {
      await delay(1000);
    }
    if (toExit) {
      break;
    }

    let out = [];
    try {
      out = await twoMonthPermits(
        {
          onlyNewPermits: true
        },
        null,
        newPermitBrowser
      );

      console.log('New permits', out);
      sse.send('new-permits', out);
    } catch (ex) {
      console.error(ex);
    }

    await delay(5000);
  }
}

let refreshBrowser;
export async function refreshPermits(args, sse) {
  if (refreshBrowser) {
    await refreshBrowser.disconnect();
  }

  refreshBrowser = browser();

  let toExit = false;
  await refreshBrowser.initializeBrowser(args.credentials, true, true, () => {
    toExit = true;
  });

  let permits = args.permits || [];

  permits.forEach(permit => {
    CLOSED_PERMITS[permit.name] = permit.closed;
  });

  while (!toExit) {
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
    } catch (ex) {}
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
  const results = {};

  if (!Array.isArray(vehicles) || !vehicles.length) {
    return results;
  }

  for (let count = 0; count < vehicles.length; count++) {
    if (!tabReady(tab)) {
      try {
        tab = await recoverTaggingTab(tabNo, options);
        await promiseWithTimeout(
          tab.gotoTagPage(taggingUrl),
          TAGGING_PAGE_TIMEOUT,
          `Recovered tagging page timed out after ${TAGGING_PAGE_TIMEOUT /
            1000}s`
        );
      } catch (recoveryError) {
        console.error('Tab', tabNo, 'recovery failed:', recoveryError.message);
        if (recoveryError.code === 'ETIMEDOUT') {
          if (tabs[tabNo] === tab) {
            tabs[tabNo] = null;
          }
          await tab.disconnect().catch(() => {});
        }
        for (; count < vehicles.length; count++) {
          const reason =
            recoveryError.message || 'Tagging browser disconnected';
          results[vehicles[count]] = reason;
          sendTagFailure(renderer, options, vehicles[count], reason);
        }
        break;
      }
    }

    let truck = vehicles[count];
    const truckStartedAt = Date.now();

    console.log('Tab', tabNo, 'tagging vehicle', count);
    try {
      let { reason, name } = await promiseWithTimeout(
        tab.tagVehicle(taggingUrl, truck, renderer, options),
        TAGGING_TRUCK_TIMEOUT,
        `Tagging ${truck} timed out after ${TAGGING_TRUCK_TIMEOUT / 1000}s`
      );

      console.log(
        'Tab',
        tabNo,
        'tagged vehicle',
        count,
        reason,
        `in ${Date.now() - truckStartedAt}ms`
      );

      if (reason && /is already tagged/i.test(reason)) {
        reason = 'Already Tagged by SomeOne';
      }
      results[truck] = reason;

      sendRenderer(renderer, 'total', 1);

      if (reason) {
        sendRenderer(renderer, 'failed', 1);
      }

      if (renderer && (reason || reason === '')) {
        sendRenderer(renderer, 'tag-result', {
          name,
          taggingUrl,
          truck: {
            [truck]: reason
          }
        });
      }
    } catch (ex) {
      console.log(
        'Tab',
        tabNo,
        'tagged vehicle',
        count,
        ex.message,
        `in ${Date.now() - truckStartedAt}ms`
      );
      if (ex.code === 'ETIMEDOUT') {
        // A timed-out Puppeteer command may never settle. Close this browser
        // so the next queue item is handled by a clean authenticated window.
        if (tabs[tabNo] === tab) {
          tabs[tabNo] = null;
        }
        await tab.disconnect().catch(disconnectError => {
          console.error(
            'Tab',
            tabNo,
            'failed closing timed-out browser:',
            disconnectError.message
          );
        });
      } else {
        await promiseWithTimeout(
          tab.gotoTagPage(taggingUrl),
          TAGGING_PAGE_TIMEOUT,
          `Tagging page reset timed out after ${TAGGING_PAGE_TIMEOUT / 1000}s`
        ).catch(async resetError => {
          console.error(
            'Tab',
            tabNo,
            'failed resetting tag page:',
            resetError.message
          );
          if (resetError.code === 'ETIMEDOUT') {
            if (tabs[tabNo] === tab) {
              tabs[tabNo] = null;
            }
            await tab.disconnect().catch(() => {});
          }
        });
      }
      const reason = ex.message || 'Tagging failed';
      results[truck] = reason;
      sendTagFailure(renderer, options, truck, reason);
    }
  }

  console.log('Tab', tabNo, 'Tagging ended');
  return results;
}

function sendRenderer(renderer, channel, payload) {
  if (!renderer || typeof renderer.send !== 'function') {
    return false;
  }
  if (typeof renderer.isDestroyed === 'function' && renderer.isDestroyed()) {
    return false;
  }

  try {
    renderer.send(channel, payload);
    return true;
  } catch (ex) {
    console.error('Unable to send tagging event', channel, ex.message);
    return false;
  }
}

function sendTagFailure(renderer, options, truck, reason) {
  sendRenderer(renderer, 'total', 1);
  sendRenderer(renderer, 'failed', 1);
  sendRenderer(renderer, 'tag-result', {
    name: (options && options.name) || '',
    taggingUrl: options && options.taggingUrl,
    truck: {
      [truck]: reason
    }
  });
}

async function tabTagging(taggingUrl, tab, takeNextTruck, options, sse, tabNo) {
  async function openTaggingPage(activeTab) {
    try {
      await promiseWithTimeout(
        activeTab.gotoTagPage(taggingUrl),
        TAGGING_PAGE_TIMEOUT,
        `Tagging page timed out after ${TAGGING_PAGE_TIMEOUT / 1000}s`
      );
      return activeTab;
    } catch (ex) {
      if (tabs[tabNo] === activeTab) {
        tabs[tabNo] = null;
      }
      await activeTab.disconnect().catch(() => {});
      throw ex;
    }
  }

  async function prepareWorker(activeTab) {
    const currentTab = tabs[tabNo] || activeTab;
    if (tabReady(currentTab)) {
      try {
        return await openTaggingPage(currentTab);
      } catch (ex) {
        console.error(
          'Tab',
          tabNo,
          'failed preparing tagging page:',
          ex.message
        );
      }
    }

    const recoveredTab = await recoverTaggingTab(tabNo, options);
    return openTaggingPage(recoveredTab);
  }

  let activeTab;
  try {
    activeTab = await prepareWorker(tab);
  } catch (ex) {
    console.error('Tab', tabNo, 'worker recovery failed:', ex.message);
    throw ex;
  }

  const results = {};
  let hasPendingTrucks = true;
  while (hasPendingTrucks) {
    // A browser that died after its previous truck must recover before it can
    // reserve another truck. Healthy workers can keep draining the queue while
    // this slot logs in again.
    const currentTab = tabs[tabNo] || activeTab;
    if (!tabReady(currentTab)) {
      try {
        activeTab = await prepareWorker(currentTab);
      } catch (ex) {
        console.error('Tab', tabNo, 'worker stopped:', ex.message);
        break;
      }
    } else {
      activeTab = currentTab;
    }

    const truck = takeNextTruck();
    if (truck === undefined) {
      hasPendingTrucks = false;
      break;
    }

    const tagged = await tagging(activeTab, [truck], options, sse, tabNo);
    Object.assign(results, tagged);
  }

  return results;
}

let tabs = [];
let tabsReady = Promise.resolve();
let taggingCredentials;
let taggingHeadless;
let requestedTaggingCredentials;
let requestedTaggingHeadless;
let requestedTaggingPoolSize = 0;
let taggingPoolOpening = false;

function tabReady(tab) {
  const tabBrowser = tab && tab.getBrowser();
  const tabPage = tab && tab.getPage();
  return Boolean(
    tabBrowser &&
      (typeof tabBrowser.isConnected !== 'function' ||
        tabBrowser.isConnected()) &&
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
  await Promise.all(
    oldTabs.map(tab => (tab ? tab.disconnect().catch(() => {}) : null))
  );
}

async function openTab(tabNo, credentials, headless) {
  const previousTab = tabs[tabNo];
  if (previousTab) {
    tabs[tabNo] = null;
    await previousTab.disconnect().catch(ex => {
      console.error(
        'Tab',
        tabNo,
        'failed closing previous browser:',
        ex.message
      );
    });
  }

  const tab = browser(tabNo);
  tabs[tabNo] = tab;

  try {
    await promiseWithTimeout(
      tab.initializeBrowser(credentials, headless, !!credentials),
      TAGGING_LOGIN_TIMEOUT,
      `Tagging browser ${tabNo +
        1} login timed out after ${TAGGING_LOGIN_TIMEOUT / 1000}s`
    );
    return true;
  } catch (ex) {
    console.error('Tab', tabNo, 'failed to initialize:', ex.message);
    await tab.disconnect().catch(() => {});
    if (tabs[tabNo] === tab) {
      tabs[tabNo] = null;
    }
    return false;
  }
}

async function recoverTaggingTab(tabNo, options) {
  const opened = await openTab(
    tabNo,
    options.credentials,
    !options.showBrowser
  );
  if (!opened || !tabReady(tabs[tabNo])) {
    throw new Error(`Unable to recover tagging browser ${tabNo + 1}`);
  }
  console.log('Recovered tagging browser', tabNo + 1);
  return tabs[tabNo];
}

export function openTabs(numTabs, credentials, headless = true) {
  console.log('open tabs called in api/index.js');
  const parsedNumTabs = Math.max(1, Math.floor(Number(numTabs) || 1));
  captchaOcr.setProcessLimit(parsedNumTabs);

  if (
    taggingPoolOpening &&
    sameCredentials(requestedTaggingCredentials, credentials) &&
    requestedTaggingHeadless === headless &&
    requestedTaggingPoolSize >= parsedNumTabs
  ) {
    console.log('Reusing tagging pool initialization already in progress');
    return tabsReady;
  }

  requestedTaggingCredentials = credentials;
  requestedTaggingHeadless = headless;
  requestedTaggingPoolSize = parsedNumTabs;
  taggingPoolOpening = true;

  const opening = tabsReady
    .catch(() => {})
    .then(async () => {
      if (
        !sameCredentials(taggingCredentials, credentials) ||
        taggingHeadless !== headless
      ) {
        await resetTabs();
      }

      taggingCredentials = credentials;
      taggingHeadless = headless;

      await Promise.all(
        [...Array(parsedNumTabs).keys()].map(i => {
          if (tabReady(tabs[i])) {
            return true;
          }
          return openTab(i, credentials, headless);
        })
      );

      return tabs;
    });

  let trackedOpening;
  trackedOpening = opening.finally(() => {
    if (tabsReady === trackedOpening) {
      taggingPoolOpening = false;
    }
  });
  tabsReady = trackedOpening;

  return tabsReady;
}

export async function startTaggingPool(options = {}) {
  if (
    !options.credentials ||
    !options.credentials.username ||
    !options.credentials.password
  ) {
    throw new Error('Cannot start tagging pool: i3ms credentials are missing');
  }

  return openTabs(
    options.numBrowsers || 10,
    options.credentials,
    !options.showBrowser
  );
}

export async function setTaggingBrowserVisibility(showBrowser) {
  const desiredHeadless = !showBrowser;
  await tabsReady.catch(() => {});

  if (tabs.some(tabReady) && taggingHeadless !== desiredHeadless) {
    const credentials = taggingCredentials;
    const poolSize = Math.max(1, tabs.length);
    await resetTabs();
    taggingHeadless = undefined;
    if (credentials && credentials.username) {
      await openTabs(poolSize, credentials, desiredHeadless);
    }
  }
}

export async function shutdown() {
  await tabsReady.catch(() => {});
  await resetTabs();
  taggingCredentials = null;
  taggingHeadless = undefined;
  requestedTaggingCredentials = null;
  requestedTaggingHeadless = undefined;
  requestedTaggingPoolSize = 0;
  taggingPoolOpening = false;

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

async function tagFromTabs(taggingUrl, trucks, options, sse) {
  try {
    const requestedBrowsers = Math.max(
      1,
      Math.floor(Number(options.numBrowsers) || tabs.length || 10)
    );
    await openTabs(
      requestedBrowsers,
      options.credentials,
      !options.showBrowser
    );

    const poolMatchesRequest =
      sameCredentials(taggingCredentials, options.credentials) &&
      taggingHeadless === !options.showBrowser;
    const readyTabEntries = poolMatchesRequest
      ? tabs
          .map((tab, tabNo) => ({ tab, tabNo }))
          .filter(entry => tabReady(entry.tab))
          .slice(0, Math.min(requestedBrowsers, trucks.length))
      : [];

    if (!readyTabEntries.length) {
      const reason = 'No tagging browser completed login';
      const failed = {};
      trucks.forEach(truck => {
        failed[truck] = reason;
        sendTagFailure(sse, options, truck, reason);
      });
      return failed;
    }

    console.log(
      `Tagging ${trucks.length} trucks with ${readyTabEntries.length} browsers`
    );

    // All browser workers pull from one queue. Faster browsers keep working
    // instead of waiting after completing a fixed chunk assigned up front.
    let nextTruckIndex = 0;
    const takeNextTruck = () => {
      if (nextTruckIndex >= trucks.length) {
        return undefined;
      }
      return trucks[nextTruckIndex++];
    };

    const tabResults = await Promise.all(
      readyTabEntries.map(({ tab, tabNo }) => {
        return tabTagging(
          taggingUrl,
          tab,
          takeNextTruck,
          options,
          sse,
          tabNo
        ).catch(ex => {
          console.error('Tab', tabNo, 'tagging stopped:', ex.message);
          // This worker stops taking new trucks. Other healthy workers keep
          // draining the same queue.
          return {};
        });
      })
    );

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

    const tagged = Object.assign({}, ...tabResults);

    // Normally every dequeued truck is reported by tagging(). Reconcile here
    // so an unexpected worker-level failure cannot leave the UI waiting for a
    // truck result that will never arrive.
    trucks.forEach(truck => {
      if (!Object.prototype.hasOwnProperty.call(tagged, truck)) {
        const reason = 'No tagging browser completed this truck';
        tagged[truck] = reason;
        sendTagFailure(sse, options, truck, reason);
      }
    });

    console.log('Complete End of Tagging');

    return tagged;
  } catch (ex) {
    console.error(ex);
    return {};
  }
}

export async function tagVehicles(options, sse) {
  const { taggingUrl, trucks } = options;
  busyFlag.isTagging = true;
  try {
    if (Array.isArray(trucks) && trucks.length) {
      return await tagFromTabs(taggingUrl, trucks, options, sse);
    }
    return {};
  } catch (ex) {
    console.error(ex);
    return {};
  } finally {
    busyFlag.isTagging = false;
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

export async function initializeBrowser(
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
