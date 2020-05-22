const frappe = require('frappejs');
const numberFormat = require('frappejs/utils/numberFormat.js');

const { DateTime } = require('luxon');

class Trip {
  async run(params) {
    console.log(params);

    const period = frappe.db.knex.raw(
      `date_trunc('${params.period}',"startDate") as period`
    );

    let trips = frappe.db.knex('Trip');

    if (params.customer) {
      trips = trips.join('Permit', 'Permit.name', 'Trip.permit');
    }

    if (params.truckOwner) {
      trips = trips.join('Truck', 'Truck.name', 'Trip.truck');
    }

    let groupNumber = 0;

    if (params.period) {
      trips = trips.select(period);
      groupNumber++;
    }

    if (params.customer) {
      trips = trips.select('Permit.customer as customer');
      groupNumber++;
    }

    if (params.truckOwner) {
      trips = trips.select('Truck.supplier as truckOwner');
      groupNumber++;
    }

    trips = trips
      .count('* as numTrips')
      .sum('loadQty as loadQty')
      .sum('unloadQty as unloadQty');

    if (groupNumber) {
      let s = Array.apply(0, Array(groupNumber))
        .map((v, i) => i + 1)
        .join(',');
      trips = trips.groupByRaw(s);
      trips = trips.orderByRaw('1 desc');
    } else {
      //trips = trips.groupByRaw('1, 2');
    }

    // if (params.customer) {
    //   trips = trips.where('Permit.customer', params.customer);
    // }

    // if (params.truckOwner) {
    //   trips = trips.where('Truck.supplier', params.truckOwner);
    // }

    if (params.permit) {
      trips = trips.where('Trip.permit', params.permit);
    }

    if (params.truck) {
      trips = trips.where('Trip.truck', params.truck);
    }

    if (params.fromDate) {
      trips = trips.where('Trip.startDate', '>=', params.fromDate);
    }

    if (params.toDate) {
      trips = trips.where('Trip.startDate', '<=', params.toDate);
    }

    let data = await trips;

    return this.appendTotalEntry(data, params);
  }

  appendTotalEntry(data, params) {
    let glEntries = [];
    let loaded = 0,
      numTrips = 0,
      unloaded = 0;

    for (let entry of data) {
      numTrips += +entry.numTrips;
      loaded += +entry.loadQty;
      entry.unloadQty = entry.unloadQty || 0;
      unloaded += entry.unloadQty;
      entry.numTrips = numberFormat.formatNumber(entry.numTrips, '#,###');
      entry.loadQty = numberFormat.formatNumber(entry.loadQty);
      entry.unloadQty = numberFormat.formatNumber(entry.unloadQty);
      if (entry.period) {
        if (params.period === 'day') {
          entry.period = frappe.format(entry.period, 'Date');
        } else if (params.period === 'week') {
          let startDate = DateTime.fromJSDate(entry.period).startOf('week');
          let endDate = DateTime.fromJSDate(entry.period).endOf('week');
          entry.period = `${startDate.toFormat('LLL dd')}-${endDate.toFormat(
            'LLL dd'
          )}`;
        } else if (params.period === 'month') {
          let startDate = DateTime.fromJSDate(entry.period).startOf('month');
          entry.period = `${startDate.toFormat('LLL yyyy')}`;
        }
      }
      console.log(entry.period);
      glEntries.push(entry);
    }

    glEntries.push({
      customer: '',
      truckOwner: '',
      period: { template: '<b>Total</b>' },
      loadQty: numberFormat.formatNumber(loaded),
      unloadQty: numberFormat.formatNumber(unloaded),
      numTrips: numberFormat.formatNumber(numTrips, '#,###')
    });

    return glEntries;
  }
}

module.exports = Trip;
