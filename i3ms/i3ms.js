const moment = require('moment');

const i3ms = require('./browser');
const _ = require('lodash');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

//export methods
export async function permitsDetails(args) {
  let permits = args.permits || [];

  console.log('permits details called', permits.length);

  permits = permits.map(p => p.permit_number);

  console.log('Number of permits in last two months', permits.length);

  const result = await i3ms.getPermits(
    'https://i3ms.orissaminerals.gov.in/i3ms/pms/ViewTransporterAction.aspx',
    '#grdTransporterActions',
    true
  );

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
        const l = await permitDetails(permit);
        out.push(l);
      }
    } else {
      console.log('Permit already exists', r['Permit No.']);
    }

    return Promise.resolve();
  }, Promise.resolve());

  return out;
}

export async function permitReport(args) {
  let fromDate = moment(args.start_date).format('DD-MMM-YYYY');
  let toDate = moment(args.end_date).format('DD-MMM-YYYY');

  let r = await i3ms.permitVehicles(
    'https://i3ms.orissaminerals.gov.in/i3MS/ePassReports/PermitWiseTransportDetails.aspx?linkn=313&linkm=15&Openstate=0',
    args.permit_number,
    fromDate,
    toDate
  );

  let trips = r.trucks.filter(t => t['Pass Number']);

  trips = _.map(trips, tpDetails => {
    console.log(tpDetails);
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

  console.log(trips);

  return trips;
}

export async function successDownload(permitNo, credentials) {
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
  const r = await i3ms.taggedVehicles(
    'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
    permitNo
  );
  return _.map(r, function(doc) {
    return {
      permitNo: permitNo,
      truck_number: doc
    };
  });
}

export async function permitDetails(permit) {
  let {
    tag_url,
    vehicle_details,
    permit_number,
    source,
    start_date,
    end_date
  } = permit;

  console.log('Calling permit details', permit);

  if (!permit.quantity) {
    let quantity = 0;

    if (tag_url && !vehicle_details) {
      const u = new URL(tag_url);
      vehicle_details =
        'https://i3ms.orissaminerals.gov.in/i3ms/pms/VehicleDetails.aspx' +
        u.search;
    }

    console.log('Calling get permit details');
    const r = await i3ms.getPermitDetails(vehicle_details);

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

  const v = await successDownload(permit_number);
  permit.tagged = _.map(v, t => t.truck_number).reduce((p, t) => {
    p[t] = '';
    return p;
  }, {});

  console.log('tagged length', permit.tagged.length);
  permit.trips = await permitReport(permit);

  if (permit.sender) {
    console.log('sending results to browser', permit);
    return permit.sender.send(
      'permit-details-results',
      _.omit(permit, ['sender'])
    );
  }

  return permit;
}

export async function tag(vehicles, options, sse) {
  const { taggingUrl } = options;
  let sno = 1;
  let retries = [];
  const failed = [];

  await vehicles.reduce(async (p, truck) => {
    await p;

    if (sse) {
      sse.send('total', sno);
    }
    sno++;

    console.log(sno, 'Tagging vehicle', truck);

    let reason = await i3ms.tagVehicle(taggingUrl, truck);

    if (reason && /is already tagged/i.test(reason)) {
      reason = '';
    }

    if (reason) {
      failed[truck] = reason;
      if (sse) {
        sse.send('failed', Object.keys(failed).length);
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

    return delay(200);
  }, Promise.resolve());

  console.log('Failed Vehicles', failed);

  return retries;
}

export async function tagVehicles(options, sse) {
  const { taggingUrl, credentials, trucks } = options;
  try {
    if (trucks.length) {
      await i3ms.browserInit(credentials);
      await i3ms.tagInit(taggingUrl);

      let retries = await tag(trucks, options, sse);

      if (retries.length) {
        //try one more time
        retries = await tag(retries, options, sse);

        if (retries.length) {
          //try one more time
          retries = await tag(retries, options, sse);
        }
      }
      sse.send('tag-result', retries);
    }
  } catch (ex) {
    console.error(ex);
  }
}

export async function releaseVehicles(options, sse) {
  const { credentials, trucks, permit_number } = options;
  console.log('release was called');
  try {
    if (trucks.length) {
      await i3ms.browserInit(credentials);
      const chunks = _.chunk(trucks, 20);

      for (let chunk of chunks) {
        console.log('chunk', chunk);
        await i3ms.releaseVehicle(
          'https://i3ms.orissaminerals.gov.in/i3ms/PMS/ReleaseVehicle.aspx?linkn=297&linkm=15&Openstate=0',
          chunk,
          permit_number
        );
      }

      const v = await successDownload(permit_number);
      return _.map(v, t => t.truck_number);
    }
  } catch (ex) {
    console.error(ex);
  }
}

if (require.main === module) {
  (async function() {
    console.log(process.argv);
    try {
      await i3ms.browserInit();
    } catch (ex) {
      console.error(ex);
    }
  })();
}
