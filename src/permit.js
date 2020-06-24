import frappe from 'frappejs';
import { DateTime } from 'luxon';

export function pickPermitFields(permit) {
  return (({
    name,
    transportedFrom,
    source,
    quantity,
    startDate,
    taggingUrl,
    vehicleDetails,
    material,
    destination,
    endDate
  }) => ({
    name,
    transportedFrom,
    source,
    quantity,
    startDate,
    taggingUrl,
    vehicleDetails,
    material,
    destination,
    endDate
  }))(permit);
}

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



async function tagReleaseObj(permit, trucks) {
  if (!permit) {
    return;
  }

  const credentials = {
    username: frappe.AccountingSettings.i3msUsername,
    password: frappe.AccountingSettings.i3msPassword
  };

  if (typeof(permit) === 'string') {
    try {
      permit = await frappe.getDoc('Permit', permit);
    } catch(ex) {
      console.error(ex);
      return;
    }
  }

  permit = pickPermitFields(permit);

  return {
    credentials,
    trucks,
    ...permit
  };
}

export async function tagVehicles(permit, trucks, cb) {
  let obj = tagReleaseObj(permit, trucks);

  if (obj) {
    frappe.events.trigger('tag-vehicles', obj);
    frappe.events.once('tag-results', cb);
  }
}

export async function releaseVehicles(permit, trucks, cb) {
  let obj = tagReleaseObj(permit, trucks);

  if (obj) {
    frappe.events.trigger('release-vehicles', obj);
    frappe.events.once('release-vehicles-results', cb);
  }
}

export async function tagRelease(doc) {

  let data = doc.data();
  let obj = tagReleaseObj(data.permit, [data.truckNo]);

  if (obj) {
    frappe.events.trigger(doc.type === 'release' ? 'release-vehicles' : 'tag-vehicles', obj);
    frappe.events.once(doc.type === 'release' ? 'release-vehicles-results'  : 'tag-results', async () => {
      console.log('PermitRequest Finished', doc);
      //delete the document
      await doc.ref.delete();
    });
  }
}


