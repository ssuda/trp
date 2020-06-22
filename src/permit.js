import frappe from 'frappejs';
import { DateTime } from 'luxon';

export async function twoMonthsOldPermits() {
  const dt = DateTime.local()
    .minus({ months: 2 })
    .toISO();

  return frappe.db.getAll({
    doctype: 'Permit',
    fields: ['*'],
    filters: {
      startDate: ['>=', dt],
      type: 'I3MS'
    }
  });
}

export async function refreshPermit(permit, cb) {
  console.log('refresh called');

  const credentials = {
    username: frappe.AccountingSettings.i3msUsername,
    password: frappe.AccountingSettings.i3msPassword
  };

  frappe.events.trigger('permit-details', {
    credentials,
    ...permit
  });

  cb = cb || (() => {});
  frappe.events.once('permit-details-results', cb);
}
