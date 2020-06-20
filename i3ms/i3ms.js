const moment = require('moment');
require('console-stamp')(console, '[HH:MM:ss.l]');

const browser = require('./browser');

const i3ms = browser();
const _ = require('lodash');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

//export methods
export async function newPermits(credentials, sse) {
  let hiddenBrowser = browser();

  await hiddenBrowser.browserInit(credentials, true, true);
  let out = [];

  while (true) {
    out = [];

    try {
      let result;

      for (let attempts = 0; attempts < 3; ++attempts) {
        try {
          result = await hiddenBrowser.getPermits(
            'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
            '#grdTransporterActions',
            false
          );
          break;
        } catch (ex) {}
      }

      await result.reduce(async (p, r) => {
        await p;
        if (/javascript/i.test(r['Permit No.']) || !r['Permit No.']) {
          return Promise.resolve();
        }

        if (!r['Vehicle Details']) {
          const createdAt = moment(
            r['Request On'] || r['Requested On'],
            'DD MMM YYYY'
          );

          const startDate = createdAt.local().format('YYYY-MM-DD');
          createdAt.add(1, 'month');
          const endDate = createdAt.local().format('YYYY-MM-DD');

          let [
            permit_number,
            start_date,
            end_date,
            source,
            tag_url,
            vehicle_details,
            quantity
          ] = [
            r['Permit No.'],
            startDate,
            endDate,
            '',
            r['Tag New Vehicle'],
            r['Vehicle Details'],
            0
          ];

          if (!tag_url) {
            const u = new URL(vehicle_details);
            tag_url =
              'https://i3ms.orissaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
              u.search;
          }

          console.log(tag_url);

          if (tag_url) {
            try {
              console.log('before get permit details');
              const r = await hiddenBrowser.getPermitDetails(vehicle_details);

              if (!permit_number) {
                permit_number = r['Permit No.'];
              }

              if (!start_date) {
                start_date = moment(r['Requested On'], 'DD MMM YYYY')
                  .local()
                  .format('YYYY-MM-DD');
              }

              if (!source) {
                source = r['Requested By'];
                // const index = source.indexOf('(');

                // if (index != -1) {
                //   source = source.substr(0, index);
                // }
              }

              if (r['Permit Qty.']) {
                quantity = parseFloat(r['Permit Qty.'].replace(/[^\d\.]/g, ''));
              }

              const validity = r['Permit Validity'] || '';

              if (validity) {
                end_date = moment(validity, 'DD MMM YYYY')
                  .local()
                  .format('YYYY-MM-DD');
              }

              let permit = {
                permit_number,
                source,
                quantity,
                start_date,
                tag_url,
                vehicle_details,
                end_date,
                transported_from: r['Transported From']
              };

              out.push(permit);
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
      sse.send('new-permits', out);
    } catch (ex) {
      console.error(ex);
    }

    await delay(out.length ? 300000 : 60000);
  }
}

export async function permitsDetails(args) {
  let permits = args.permits || [];

  console.log('permits details called', permits.length);

  permits = permits.map(p => p.permit_number);

  console.log('Number of permits in last two months', permits.length);
  let result;

  for (let attempts = 0; attempts < 3; ++attempts) {
    try {
      result = await i3ms.getPermits(
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        true
      );
      break;
    } catch (ex) {}
  }

  const out = [];

  await result.reduce(async (p, r) => {
    await p;
    if (/javascript/i.test(r['Permit No.']) || !r['Permit No.']) {
      return Promise.resolve();
    }

    if (!permits.includes(r['Permit No.'])) {
      console.log('Permit not exists', r['Permit No.'], permits);

      const createdAt = moment(
        r['Request On'] || r['Requested On'],
        'DD MMM YYYY'
      );
      const startDate = createdAt.local().format('YYYY-MM-DD');
      createdAt.add(1, 'month');
      const endDate = createdAt.local().format('YYYY-MM-DD');

      let permit = {
        permit_number: r['Permit No.'],
        start_date: startDate,
        end_date: endDate,
        tag_url: r['Tag New Vehicle'],
        vehicle_details: r['Vehicle Details'],
        sender: args.sender
      };

      if (!permit.tag_url) {
        const u = new URL(permit.vehicle_details);
        permit.tag_url =
          'https://i3ms.orissaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx' +
          u.search;
      }

      console.log(permit.tag_url);

      if (permit.tag_url) {
        try {
          console.log('fetching permit', permit.permit_number);
          const l = await permitDetails(permit);
          console.log('finished fetching permit', permit.permit_number);
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

export async function permitReport(args) {
  let fromDate = moment(args.start_date).format('DD-MMM-YYYY');
  let toDate = moment(args.end_date).format('DD-MMM-YYYY');

  let retries = 0;

  while (retries < 3) {
    try {
      let r = await i3ms.permitVehicles(
        'https://i3ms.orissaminerals.gov.in/i3MS/ePassReports/PermitWiseTransportDetails.aspx?linkn=313&linkm=15&Openstate=0',
        args.permit_number,
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

      //console.log(trips);
      return trips;
    } catch (ex) {
      retries++;
    }
  }
}

export async function successfullyTagged(permitNo, credentials) {
  if (credentials) {
    console.log(credentials);
    await i3ms.browserInit(credentials);
  }

  console.log('permitno', permitNo);
  if (/^http/i.test(permitNo)) {
    console.log('Trying to browser', permitNo);
    const t = await i3ms.tagInit(permitNo);
    permitNo = t['Permit No.'];
  }

  const v = await i3ms.releasePage(
    'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
    permitNo
  );

  return v.reduce((p, t) => {
    p[t] = '';
    return p;
  }, {});
}

export async function permitDetails(permit) {
  let {
    tag_url,
    vehicle_details,
    permit_number,
    source,
    start_date,
    end_date,
    noTrips,
    validate
  } = permit;

  console.log('inside permit details', permit);

  if (!permit.quantity) {
    let quantity = 0;

    if (tag_url && !vehicle_details) {
      const u = new URL(tag_url);
      vehicle_details =
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/VehicleDetails.aspx' +
        u.search;
    }

    console.log('before get permit details');
    const r = await i3ms.getPermitDetails(vehicle_details);

    if (!permit_number) {
      permit_number = r['Permit No.'];
    }

    if (validate) {
      let result = await i3ms.getPermits(
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
        '#grdTransporterActions',
        true
      );

      let found = false;
      for (let i = 0; i < result.length; ++i) {
        if (r['Permit No.'] == permit_number) {
          found = true;
          break;
        }
      }

      if (!found) {
        permit.sender.send(
          'permit-details-results',
          null
        );
        return null;
      }
    }

    if (!start_date) {
      start_date = moment(r['Requested On'], 'DD MMM YYYY')
        .local()
        .format('YYYY-MM-DD');
    }

    if (!source) {
      source = r['Requested By'];
      const index = source.indexOf('(');

      if (index != -1) {
        source = source.substr(0, index);
      }
    }

    if (r['Permit Qty.']) {
      quantity = parseFloat(r['Permit Qty.'].replace(/[^\d\.]/g, ''));
    }

    const validity = r['Permit Validity'] || '';

    if (validity) {
      end_date = moment(validity, 'DD MMM YYYY')
        .local()
        .format('YYYY-MM-DD');
    }

    permit = Object.assign(permit, {
      permit_number,
      source,
      quantity,
      start_date,
      tag_url,
      vehicle_details,
      end_date
    });
  }

  permit.tagged = await successfullyTagged(permit_number);

  console.log('tagged length', permit.tagged.length);
  if (!noTrips) {
    permit.trips = await permitReport(permit);
  } else {
    permit.trips = [];
  }

  if (permit.sender) {
    console.log('sending results to browser', permit.permit_number);
    permit.sender.send(
      'permit-details-results',
      _.omit(permit, ['sender', 'credentials'])
    );
  }

  console.log('returning from permitdetails', permit.permit_number);
  return permit;
}

export async function tagVehicle(obj, vehicles, options, sse) {
  const { taggingUrl } = options;
  let sno = 1;
  let retries = [];
  const failed = [];

  await vehicles.reduce(async (p, truck) => {
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
  await tab.browserInit(options.credentials, !options.showBrowser, true);
  await tabTagging(taggingUrl, tab, chunk, options, sse);
  return tab;
}

async function openTabs(taggingUrl, chunks, options, sse) {
  try {
    let tabs = [];
    let numTabs = (+options.numBrowsers || 4) - 1;

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

    for (let i = 0; i < numTabs; ++i) {
      await tabs[i].disconnect();
    }
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
  let chunk = chunks[0];
  try {
    if (trucks.length) {
      //await i3ms.tagInit(taggingUrl);
      i3ms.tabNo = 0;
      await Promise.all([
        openTabs(taggingUrl, chunks.slice(1), options, sse),
        tabTagging(taggingUrl, i3ms, chunk, options, sse)
      ]);
    }
  } catch (ex) {
    console.error(ex);
  }

  if (!permitNumber) {
    return permitDetails({
      tag_url: taggingUrl
    });
  }
  return successfullyTagged(permitNumber);
}

export async function releaseVehicles(options, sse) {
  const { trucks, name: permit_number } = options;
  console.log('release was called');
  try {
    if (trucks.length) {
      const chunks = _.chunk(trucks, 20);
      let tagged = [];

      for (let chunk of chunks) {
        console.log('chunk', chunk);
        tagged = await i3ms.releasePage(
          'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
          permit_number,
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

export async function browserInit(cred, headless, tologin) {
  return i3ms.browserInit(cred, headless, tologin);
}

export async function disconnect() {
  return i3ms.disconnect();
}
