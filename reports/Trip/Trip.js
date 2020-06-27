const frappe = require('frappejs');
const numberFormat = require('frappejs/utils/numberFormat.js');

const { DateTime } = require('luxon');

class Trip {
  async aggregate(params) {
    let trips = frappe.db.knex('Trip');

    trips = trips.countDistinct('permit as totalPermits');

    if (params.customer || params.type) {
      trips = trips.join('Permit', 'Permit.name', 'Trip.permit');
    }

    if (params.truckOwner) {
      trips = trips.join('Truck', 'Truck.name', 'Trip.truck');
    }

    if (params.customer) {
      trips = trips.where('Permit.customer', params.customer);
    }

    if (params.type) {
      trips = trips.where('Permit.type', params.type);
    }

    if (params.truckOwner) {
      trips = trips.where('Truck.supplier', params.truckOwner);
    }

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

    return trips;
  }

  async run(params) {
    console.log(params);

    let trips = frappe.db.knex('Trip');

    let groupNumber = 0;

    if (params.periodicity) {
      let modifier = 'start of day';
      if (params.periodicity === 'week') {
        modifier = 'weekday 0';
      } else if (params.periodicity === 'month') {
        modifier = 'start of month';
      }

      const periodicity = frappe.db.knex.raw(
        `date("Trip"."startDate", '${modifier}') as periodicity`
      );
      trips = trips.select(periodicity);
      groupNumber++;
    }

    trips = trips.select('Permit.transportedFrom as transportedFrom');
    groupNumber++;
    trips = trips.select('Permit.destination as destination');
    groupNumber++;

    if (params.i3msReturns) {
      trips = trips.select('permit');
      groupNumber++;
      trips = trips.select('Permit.source as source');
      groupNumber++;
      trips = trips.select('Permit.material as material');
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
      .countDistinct('permit as numPermits')
      .count('* as numTrips')
      .sum('loadQty as loadQty')
      .sum('unloadQty as unloadQty');

    //if (params.customer || params.type || params.i3msReturns) {
    trips = trips.join('Permit', 'Permit.name', 'Trip.permit');
    //}

    if (params.truckOwner) {
      trips = trips.join('Truck', 'Truck.name', 'Trip.truck');
    }

    if (groupNumber) {
      let s = Array.apply(0, Array(groupNumber))
        .map((v, i) => i + 1)
        .join(',');
      trips = trips.groupByRaw(s);
      if (params.dashboard || params.i3msReturns) {
        trips = trips.orderByRaw('1');
      } else {
        trips = trips.orderByRaw('1 desc');
      }
    }

    if (params.customer) {
      trips = trips.where('Permit.customer', params.customer);
    }

    if (params.transportedFrom) {
      trips = trips.where('Permit.transportedFrom', params.transportedFrom);
    }

    if (params.destination) {
      trips = trips.where('Permit.destination', params.destination);
    }

    if (params.type) {
      trips = trips.where('Permit.type', params.type);
    }

    if (params.truckOwner) {
      trips = trips.where('Truck.supplier', params.truckOwner);
    }

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
    let total = await this.aggregate(params);
    console.log('data', data);

    return this.appendTotalEntry(data, total, params);
  }

  appendTotalEntry(data, total, params) {
    let glEntries = [];
    let loaded = 0,
      numTrips = 0,
      numPermits = total[0].totalPermits,
      unloaded = 0;

    for (let entry of data) {
      numTrips += +entry.numTrips;
      loaded += +entry.loadQty;
      entry.unloadQty = entry.unloadQty || 0;
      unloaded += entry.unloadQty;

      entry.transportedFrom = entry.transportedFrom.toLowerCase();
      entry.destination = entry.destination
        .substring(0, entry.destination.indexOf(','))
        .toLowerCase();

      if (!params.dashboard && !params.i3msReturns) {
        entry.numPermits = numberFormat.formatNumber(entry.numPermits, '#,###');
        entry.numTrips = numberFormat.formatNumber(entry.numTrips, '#,###');
        entry.loadQty = numberFormat.formatNumber(entry.loadQty);
        entry.unloadQty = numberFormat.formatNumber(entry.unloadQty);
      }

      if (entry.periodicity) {
        if (params.periodicity === 'day') {
          if (params.dashboard || params.i3msReturns) {
            let startDate = DateTime.fromISO(entry.periodicity);
            if (!params.i3msReturns) {
              entry.periodicity = `${startDate.toFormat('LLL dd')}`;
            } else {
              entry.periodicity = `${startDate.toFormat('dd-MM-yyyy')}`;
            }
          } else {
            entry.periodicity = frappe.format(entry.periodicity, 'Date');
          }
        } else if (params.periodicity === 'week') {
          let startDate = DateTime.fromISO(entry.periodicity).startOf('week');
          let endDate = DateTime.fromISO(entry.periodicity).endOf('week');
          entry.periodicity = `${startDate.toFormat(
            'LLL dd'
          )}-${endDate.toFormat('LLL dd')}`;
        } else if (params.periodicity === 'month') {
          let startDate = DateTime.fromISO(entry.periodicity).startOf('month');
          entry.periodicity = `${startDate.toFormat('LLL yyyy')}`;
        }
      }
      console.log(entry.periodicity);
      glEntries.push(entry);
    }

    if (!params.dashboard && !params.i3msReturns) {
      glEntries.unshift({
        customer: '',
        truckOwner: '',
        periodicity: { template: '<b>Total</b>' },
        numPermits: numberFormat.formatNumber(numPermits, '#,###'),
        loadQty: numberFormat.formatNumber(loaded),
        unloadQty: numberFormat.formatNumber(unloaded),
        numTrips: numberFormat.formatNumber(numTrips, '#,###')
      });
    }

    return glEntries;
  }
}

module.exports = Trip;
