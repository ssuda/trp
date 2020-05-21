const frappe = require('frappejs');
const numberFormat = require('frappejs/utils/numberFormat.js');
class Trip {
  async run(params) {
    let trips = frappe.db
      .knex('Trip')
      .join('Permit', 'Permit.name', 'Trip.permit')
      .join('Truck', 'Truck.name', 'Trip.truck')
      .select('Permit.customer as customer', 'Truck.supplier as truckOwner')
      .count('* as numTrips')
      .sum('loadQty as loadQty')
      .sum('unloadQty as unloadQty')
      .groupBy('Permit.customer', 'Truck.supplier');

    if (params.customer) {
      trips = trips.where('Permit.customer', params.customer);
    }

    if (params.truckOwner) {
      trips = trips.where('Truck.supplier', params.truckOwner);
    }

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
      glEntries.push(entry);
    }

    glEntries.push({
      customer: '',
      truckOwner: { template: '<b>Total</b>' },
      loadQty: numberFormat.formatNumber(loaded),
      unloadQty: numberFormat.formatNumber(unloaded),
      numTrips: numberFormat.formatNumber(numTrips, '#,###')
    });

    return glEntries;
  }
}

module.exports = Trip;
