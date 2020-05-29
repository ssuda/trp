const frappe = require('frappejs');
const { firestore } = require('@/firebase');
const { DateTime } = require('luxon');
const { machineIdSync } = require('node-machine-id');

let singleRegistered = false;
let deviceId = machineIdSync({ original: true });

async function processRecord(query, cb, start, end) {
  let offset = start || 0;

  while (true) {
    console.log('Starting to fetch', offset);

    const limit = end - offset < 200 ? end - offset : 200;
    const snapshot = await query
      .limit(limit)
      .offset(offset)
      .get();
    if (snapshot.size == 0) {
      console.log('No documents ending');
      break;
    }

    offset += snapshot.size;

    await Promise.all(snapshot.docs.map(doc => cb(doc, offset)));

    if (end && offset >= end) {
      console.log('No documents ending');
      break;
    }
  }
}

module.exports = async function() {
  // check with firestore about updates and subscribe to the changes
  const accountingSettings = frappe.AccountingSettings;
  for (let model in frappe.models) {
    // check latest modified time for each doctype and register for changes

    const modelDef = frappe.models[model];

    const table = modelDef.isSingle
      ? 'SingleValue'
      : modelDef.basedOn || modelDef.name;
    let query = firestore
      .collection(model)
      .where('gstin', '==', accountingSettings.gstin)
      .where('deviceId', '!=', deviceId);

    try {
      const row = await frappe.db.knex.raw(
        `select modified from ${table} order by modified limit 1`
      );

      if (row.length) {
        console.log(model, 'last modified', model, row[0]);
        query = query.where('modified', '>=', row[0].modified);
      }

      await processRecord(query, async doc => {
        console.log('syncing ', doc.id);
        await frappe.syncDoc({
          doctype: model,
          ...doc
        });
      });
    } catch (ex) {}

    if (modelDef.isSingle && singleRegistered) {
      continue;
    }

    singleRegistered = true;

    console.log('registering', table);

    query.onSnapshot(function(querySnapshot) {
      console.log('received from firestore', querySnapshot.size);
      querySnapshot.forEach(async function(doc) {
        doc = doc.data();
        await frappe.syncDoc({
          doctype: model,
          ...doc
        });
      });
    });
  }
};
