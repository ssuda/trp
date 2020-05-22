const frappe = require('frappejs');
const numberFormat = require('frappejs/utils/numberFormat.js');

class Trip {
  async run(params) {
    const period = frappe.db.knex.raw(
      `date_trunc('${params.period}',Trip.startDate) as period`
    );

    let trips = frappe.db.knex('Trip');
    // .join('Permit', 'Permit.name', 'Trip.permit')
    // .join('Truck', 'Truck.name', 'Trip.truck');

    if (params.period) {
      trips = trips.select(period);
      //trips = trips.select('Permit.customer as customer', 'Truck.supplier as truckOwner', period)
    } else {
      //trips = trips.select('Permit.customer as customer', 'Truck.supplier as truckOwner')
    }

    trips = trips
      .count('* as numTrips')
      .sum('loadQty as loadQty')
      .sum('unloadQty as unloadQty');

    if (params.period) {
      trips = trips.groupByRaw('1');
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

    if (params.fromDate) {
      trips = trips.where('Trip.startDate', '>=', params.fromDate);
    }

    if (params.toDate) {
      trips = trips.where('Trip.startDate', '<=', params.toDate);
    }

    let data = await trips;

    return this.appendTotalEntry(data);
  }

  appendTotalEntry(data) {
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
        entry.period = frappe.format(entry.period, 'Date');
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
