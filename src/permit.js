import frappe from 'frappejs';

export async function twoMonthsOldPermits() {
  const dt = DateTime.local()
    .minus({ months: 2 })
    .toISO();

  const credentials = {
    username: frappe.AccountingSettings.i3msUsername,
    password: frappe.AccountingSettings.i3msPassword
  };

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
  //let credentials;

  // if (typeof permit.account == 'string') {
  //   credentials = await frappe.getDoc('I3MSAccount', permit.account);
  // } else {
  //   credentials = permit.account;
  // }

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
