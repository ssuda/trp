import frappe from 'frappejs';

export async function refreshPermit(permit, cb) {
  console.log('refresh called');
  let credentials;

  if (typeof permit.account == 'string') {
    credentials = await frappe.getDoc('I3MSAccount', permit.account);
  } else {
    credentials = permit.account;
  }

  frappe.events.trigger('permit-details', {
    credentials,
    tag_url: permit.taggingUrl,
    vehicle_details: permit.vehicleDetails,
    permit_number: permit.name,
    start_date: permit.startDate,
    end_date: permit.endDate,
    quantity: permit.quantity
  });

  cb = cb || (() => {});
  frappe.events.once('permit-details-results', cb);
}
