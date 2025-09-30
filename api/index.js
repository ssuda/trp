const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Kolkata');
require('console-stamp')(console, '[HH:MM:ss.l]');

const browser = require('./browser');

const i3ms = browser();
const _ = require('lodash');

const { delay, promiseWithTimeout } = require('./utils');

export let busyFlag = {
  isBusy: false
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

  for (let count = 0; count < vehicles.length; ) {
    if (!tab.getBrowser()) return Promise.resolve();

    let truck = vehicles[count];

    console.log('Tab', tabNo, 'tagging vehicle', count);
    try {
      let { reason, name } = await promiseWithTimeout(
        tab.tagVehicle(taggingUrl, truck, renderer, options),
        120000
      );

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

      if (reason || reason === '') {
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
      await tab.gotoTagPage(taggingUrl);
    }
  }

  console.log('Tab', tabNo, 'Tagging ended');
}

async function tabTagging(taggingUrl, tab, chunk, options, sse, tabNo) {
  await tab.gotoTagPage(taggingUrl);
  await tagging(tab, chunk, options, sse, tabNo);
}

let tabs = [];

async function tagFromTab(taggingUrl, chunk, options, sse, tabNo) {
  const tab = tabs[tabNo];
  await tabTagging(taggingUrl, tab, chunk, options, sse, tabNo);
}

async function openTab(tabNo, credentials, headless) {
  const tab = browser(tabNo);
  tabs.push(tab);
  await tab.initializeBrowser(credentials, headless, !!credentials);
}

export function openTabs(numTabs, credentials, headless = true) {
  console.log('open tabs called in api/index.js');
  return Promise.all(
    [...Array(numTabs).keys()].map(i => {
      return openTab(i, credentials, headless);
    })
  );
}

async function tagFromTabs(taggingUrl, chunks, options, sse) {
  try {
    if (!tabs.length) {
      await openTabs(
        options.numBrowsers || 10,
        options.credentials,
        options.showBrowser
      );
    }

    await Promise.all(
      tabs.map((_, i) => {
        return tagFromTab(taggingUrl, chunks[i], options, sse, i);
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

    console.log('Fetching Successfully Tagged', options.name);

    const tagged = await successfullyTagged(options.name, null, tabs[0]);

    // for (let i = 0; i < numTabs; ++i) {
    //   await tabs[i].disconnect();
    // }

    console.log('Complete End of Tagging');

    return tagged;
  } catch (ex) {
    console.error(ex);
  }
}

export async function tagVehicles(options, sse) {
  const { taggingUrl, name: permitNumber, trucks } = options;
  let chunks = _.chunk(
    trucks,
    Math.ceil(trucks.length / (+options.numBrowsers || tabs.length))
  );
  try {
    if (trucks.length) {
      return tagFromTabs(taggingUrl, chunks, options, sse);
    }
  } catch (ex) {
    console.error(ex);
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
