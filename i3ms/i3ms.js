const moment = require('moment');
require('console-stamp')(console, '[HH:MM:ss.l]');

const browser = require('./browser');

const i3ms = browser();
const _ = require('lodash');

const { delay } = require('./utils');

export let busyFlag = {
  isBusy: false
};

//export methods
let newPermitBrowser;

export async function newPermits(credentials, sse) {
  if (newPermitBrowser) {
    await newPermitBrowser.disconnect();
  }

  newPermitBrowser = browser();

  let toExit = false;

  await newPermitBrowser.browserInit(credentials, true, true, () => {
    toExit = true;
  });

  while (!toExit) {
    let out = [];
    try {
      console.log('Calling new permits');

      out = await permitsDetails(
        {
          onlyNewPermits: true
        },
        null,
        newPermitBrowser
      );

      console.log('new permits details', out);
      sse.send('new-permits', out);
    } catch (ex) {
      console.error(ex);
    }

    await delay(out.length ? 300000 : 60000);
  }
}

let refreshBrowser;
export async function refreshPermits(args, sse) {
  console.log('Calling refreshPermits');

  if (refreshBrowser) {
    await refreshBrowser.disconnect();
  }

  refreshBrowser = browser();

  let toExit = false;
  await refreshBrowser.browserInit(args.credentials, true, true, () => {
    toExit = true;
  });

  let permits = args.permits || [];

  permits.forEach(permit => {
    CLOSED_PERMITS[permit.name] = permit.closed;
  });

  while (!toExit) {
    console.log('Calling refresh permits');

    while (busyFlag.isBusy) {
      await delay(120000);
    }

    try {
      permits = await permitsDetails({}, sse, refreshBrowser);
    } catch (ex) {
      console.error(ex);
    }

    await delay(process.env.NODE_ENV === 'development' ? 600000 : 1800000);
  }
}

const CLOSED_PERMITS = {};

export async function permitsDetails(args, sse, browser = i3ms) {
  let permits = args.permits || [];

  console.log('permits details called', permits.length);

  permits = permits.map(p => {
    // Refresh all for Returns
    // if (args.i3msReturns) {
    //   CLOSED_PERMITS[p.name] = p.closed;
    // }
    return p.name;
  });

  console.log('Number of permits in last two months', permits.length);
  let result = [];

  for (let attempts = 0; attempts < 3; ++attempts) {
    try {
      result = await browser.getPermits(
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        !args.onlyNewPermits
      );
      break;
    } catch (ex) {}
  }

  const out = [];

  const lastMonth = moment()
    .subtract(1, 'months')
    .endOf('month');

  console.log('Total number of permits', result.length);
  await result.reduce(async (p, r) => {
    if (!browser.getBrowser()) return Promise.resolve();

    await p;
    if (/javascript/i.test(r['Permit No.']) || !r['Permit No.']) {
      return Promise.resolve();
    }

    if (CLOSED_PERMITS[r['Permit No.']]) {
      return Promise.resolve();
    }

    if (args.i3msReturns || !permits.includes(r['Permit No.'])) {
      console.log('Permit not exists', r['Permit No.']);

      const createdAt = moment(
        r['Request On'] || r['Requested On'],
        'DD MMM YYYY'
      );

      if (args.i3msReturns && createdAt.isAfter(lastMonth)) {
        console.log('This Permit is this month', r['Permit No.']);
        return Promise.resolve();
      }

      const startDate = createdAt.local().format('YYYY-MM-DD');
      createdAt.add(1, 'month');
      const endDate = createdAt.local().format('YYYY-MM-DD');

      let permit = {
        name: r['Permit No.'],
        startDate: startDate,
        endDate: endDate,
        taggingUrl: r['Tag New Vehicle'],
        vehicleDetails: r['Vehicle Details']
      };

      if (args.onlyNewPermits && permit.taggingUrl) {
        return Promise.resolve();
      }

      if (!permit.taggingUrl) {
        const u = new URL(permit.vehicleDetails);
        permit.taggingUrl =
          'https://i3ms.orissaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
          u.search;
      }

      console.log(permit.taggingUrl);

      if (permit.taggingUrl) {
        try {
          console.log('fetching permit', permit.name);
          const l = await permitDetails(permit, sse, browser);
          console.log('finished fetching permit', permit.name);
          out.push(l);
        } catch (ex) {
          console.error(ex);
        }
      }
    } else {
      console.log('Permit already exists', r['Permit No.']);
    }

    return Promise.resolve();
  }, Promise.resolve());

  console.log('permits details', out);
  return out;
}

export async function permitReport(args, sse, browser = i3ms) {
  let fromDate = moment(args.startDate).format('DD-MMM-YYYY');
  let toDate = moment(args.endDate).format('DD-MMM-YYYY');

  let retries = 0;

  while (retries < 3) {
    try {
      let r = await browser.permitVehicles(
        'https://i3ms.orissaminerals.gov.in/i3MS/ePassReports/PermitWiseTransportDetails.aspx?linkn=313&linkm=15&Openstate=0',
        args.name,
        fromDate,
        toDate
      );

      console.log('permit details', r);

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
          tp_date: moment(tpDetails['Pass Date'], [
            'MM/DD/YYYY hh:mm:ss A',
            'DD MMM YYYY'
          ]).toDate(),
          tp_number: tpDetails['Pass Number Text'],
          tp_url: tpDetails['Pass Number'],
          truck_number: tpDetails['Truck Number'],
          load_carrying: parseFloat(wt)
        };
      });

      delete r.trucks;
      r.trips = trips;

      //console.log(trips);
      return r;
    } catch (ex) {
      retries++;
    }
  }
}

async function successfullyTagged(permitNo, credentials, browser = i3ms) {
  if (credentials) {
    console.log(credentials);
    await browser.browserInit(credentials, true);
  }

  console.log('permitno', permitNo);
  if (/^http/i.test(permitNo)) {
    console.log('Trying to browser', permitNo);
    const t = await browser.tagInit(permitNo);
    permitNo = t['Permit No.'];
  }

  const v = await browser.releasePage(
    'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
    permitNo
  );

  return v.reduce((p, t) => {
    p[t] = '';
    return p;
  }, {});
}

export async function permitDetails(permit, sse, browser = i3ms) {
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

  console.log('inside permit details', permit);

  if (!quantity || !destination || !transportedFrom || !taggingUrl) {
    if (taggingUrl && !vehicleDetails) {
      const u = new URL(taggingUrl);
      vehicleDetails =
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/VehicleDetails.aspx' +
        u.search;
    }

    console.log('before get permit details');
    const r = await browser.getPermitDetails(vehicleDetails);

    if (!permitNumber) {
      permitNumber = r['Permit No.'];
    }

    if (validate) {
      console.log('fetching permit in the list', permitNumber);

      let result = await browser.getPermits(
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        true
      );

      let found = false;
      for (let i = 0; i < result.length; ++i) {
        if (result[i]['Permit No.'] == permitNumber) {
          console.log('found permit in the list', permitNumber);
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

  console.log('tagged length', permit.tagged.length);
  if (!noTrips) {
    let reportResult = await permitReport(permit, sse, browser);

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
        reportResult['Permit Quantity'].replace(/[^\d\.]/g, '')
      );
    }

    permit.trips = reportResult.trips;
    //check whether there no trips for in last one week
    const latestTrip = permit.trips.reduce((p, trip) => {
      if (p > trip.tp_date.getTime()) {
        return p;
      }

      return trip.tp_date.getTime();
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
    console.log('sending results to browser', permitNumber);
    sse.send(
      'permit-details-results',
      _.omit(permit, ['sender', 'credentials'])
    );
  }

  console.log('returning from permitdetails', permitNumber);
  return permit;
}

export async function tagVehicle(obj, vehicles, options, sse) {
  const { taggingUrl } = options;
  let sno = 1;
  let retries = [];
  const failed = [];

  await vehicles.reduce(async (p, truck) => {
    if (!obj.getBrowser()) return Promise.resolve();

    await p;

    sno++;

    console.log(sno, 'Tagging vehicle', truck);

    let reason = await obj.tagVehicle(taggingUrl, truck);

    if (reason && /is already tagged/i.test(reason)) {
      reason = 'Already Tagged by SomeOne';
    }

    if (sse) {
      sse.send('total', 1);
    }

    if (reason) {
      failed[truck] = reason;
      if (sse) {
        sse.send('failed', 1);
      }
    }

    if (reason || reason === '') {
      sse.send('tag-truck-result', {
        [truck]: reason
      });
    } else {
      //retry tagging
      retries.push(truck);
    }

    //return delay(200);
  }, Promise.resolve());

  console.log('Failed Vehicles', failed);

  return retries;
}

async function tabTagging(taggingUrl, tab, chunk, options, sse) {
  await tab.tagInit(taggingUrl);

  console.log(tab.tabNo, 'tagging chunk', chunk);
  let retries = await tagVehicle(tab, chunk, options, sse);

  if (retries.length) {
    //try one more time
    retries = await tagVehicle(tab, retries, options, sse);

    if (retries.length) {
      //try one more time
      retries = await tagVehicle(tab, retries, options, sse);
    }
  }
}

async function tagFromTab(taggingUrl, chunk, options, sse) {
  const tab = browser();
  await tab.browserInit(options.credentials, false, true);
  await tabTagging(taggingUrl, tab, chunk, options, sse);
  return tab;
}

async function openTabs(taggingUrl, chunks, options, sse) {
  try {
    let tabs = [];
    let numTabs = +options.numBrowsers || 4;

    numTabs = chunks.length > numTabs ? numTabs : chunks.length;

    let arr = [];

    for (let i = 0; i < numTabs; ++i) {
      arr.push(i);
    }

    console.log('creating browsers', arr);

    await Promise.all(
      arr.map(async i => {
        console.log('creating browser', i);
        const tab = await tagFromTab(taggingUrl, chunks[i], options, sse);
        tabs.push(tab);
      })
    );

    if (!options.name) {
      return permitDetails(
        {
          taggingUrl: taggingUrl
        },
        sse
      );
    }
    const tagged = await successfullyTagged(options.name, null, tabs[0]);

    for (let i = 0; i < numTabs; ++i) {
      await tabs[i].disconnect();
    }

    return tagged;
  } catch (ex) {
    console.error(ex);
  }
}

export async function tagVehicles(options, sse) {
  const { taggingUrl, name: permitNumber, trucks } = options;
  let chunks = _.chunk(
    trucks,
    Math.ceil(trucks.length / (+options.numBrowsers || 4))
  );
  try {
    if (trucks.length) {
      return openTabs(taggingUrl, chunks, options, sse);
    }
  } catch (ex) {
    console.error(ex);
  }
}

export async function releaseVehicles(options, sse) {
  const { trucks, name: permitNumber } = options;
  console.log('release was called');
  try {
    if (trucks.length) {
      const chunks = _.chunk(trucks, 20);
      let tagged = [];

      for (let chunk of chunks) {
        console.log('chunk', chunk);
        tagged = await i3ms.releasePage(
          'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
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

export async function browserInit(
  cred,
  headless,
  tologin,
  cb,
  returnCompanyName
) {
  return i3ms.browserInit(cred, true, tologin, cb, returnCompanyName);
}

export async function disconnect() {
  return i3ms.disconnect();
}

export async function companyName() {
  return i3ms.companyName();
}
