const frappe = require('frappejs');
const numberFormat = require('frappejs/utils/numberFormat.js');

const { DateTime } = require('luxon');

class Tag {
  async run(params) {
    console.log(params);

    let permits = frappe.db.knex('Permit');

    let groupNumber = 0;

    if (params.periodicity) {
      let modifier = 'start of day';
      if (params.periodicity === 'week') {
        modifier = 'weekday 0';
      } else if (params.periodicity === 'month') {
        modifier = 'start of month';
      }

      const periodicity = frappe.db.knex.raw(
        `date("Permit"."startDate", '${modifier}') as periodicity`
      );
      permits = permits.select(periodicity);
      groupNumber++;
    }

    if (params.customer) {
      permits = permits.select('Permit.customer as customer');
      groupNumber++;
    }

    permits = permits.count('name as numPermits').sum('numTagged as numTagged');

    if (groupNumber) {
      let s = Array.apply(0, Array(groupNumber))
        .map((v, i) => i + 1)
        .join(',');
      permits = permits.groupByRaw(s);
      permits = permits.orderByRaw('1 desc');
    }

    if (params.permit) {
      permits = permits.where('Permit.name', params.permit);
    }

    if (params.customer) {
      permits = permits.where('Permit.customer', params.customer);
    }

    if (params.fromDate) {
      permits = permits.where('Permit.startDate', '>=', params.fromDate);
    }

    if (params.toDate) {
      permits = permits.where('Permit.startDate', '<=', params.toDate);
    }

    let data = await permits;
    console.log('data', data);

    return this.appendTotalEntry(data, params);
  }

  appendTotalEntry(data, params) {
    let glEntries = [];
    let numTagged = 0,
      numPermits = 0;

    for (let entry of data) {
      numTagged += +entry.numTagged;
      numPermits += +entry.numPermits;

      entry.numPermits = numberFormat.formatNumber(entry.numPermits, '#,###');
      entry.numTagged = numberFormat.formatNumber(entry.numTagged, '#,###');

      if (entry.periodicity) {
        if (params.periodicity === 'day') {
          entry.periodicity = frappe.format(entry.periodicity, 'Date');
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
      glEntries.push(entry);
    }

    glEntries.unshift({
      customer: '',
      periodicity: { template: '<b>Total</b>' },
      numPermits: numberFormat.formatNumber(numPermits, '#,###'),
      numTagged: numberFormat.formatNumber(numTagged, '#,###')
    });

    return glEntries;
  }
}

module.exports = Tag;
