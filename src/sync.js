const frappe = require('frappejs');
const { firestore } = require('@/firebase');
const { DateTime } = require('luxon');
const { machineIdSync } = require('node-machine-id');

let singleRegistered = false;
let deviceId = machineIdSync({ original: true });

async function processRecord(query, cb, model) {
  let startAfter;

  while (true) {
    try {
      query = query.limit(200);

      if (startAfter) {
        query = query.startAfter(startAfter);
      }

      const snapshot = await query.get();
      console.log('Fetched', snapshot.size, model);

      if (snapshot.size == 0) {
        console.log('No documents ending', model);
        break;
      }

      startAfter = snapshot.docs[snapshot.docs.length - 1];

      await Promise.all(snapshot.docs.map(doc => cb(doc)));
    } catch (ex) {
      console.error(ex);
    }
  }
}

module.exports = async function() {
  // check with firestore about updates and subscribe to the changes
  const accountingSettings = frappe.AccountingSettings;
  if (!accountingSettings) {
    return;
  }

  const gstin = accountingSettings.gstin || frappe.currentUser.remote.gstin;

  for (let model in frappe.models) {
    if (['Tax', 'Currency', 'GetStarted'].includes(model)) {
      continue;
    }

    // check latest modified time for each doctype and register for changes

    const modelDef = frappe.models[model];

    const table = modelDef.isSingle
      ? 'SingleValue'
      : modelDef.basedOn || modelDef.name;

    console.log(model, gstin);

    let query = firestore.collection(model).where('gstin', '==', gstin);
    // .where('deviceId', '<', deviceId)
    // .where('deviceId', '>', deviceId);

    try {
      const row = await frappe.db.knex.raw(
        `select modified from ${table} order by modified limit 1`
      );

      if (row.length) {
        console.log(model, 'last modified', model, row[0]);
        query = query.where('modified', '>=', row[0].modified);
      }

      console.log(query);
      await processRecord(query, async doc => {
        console.log('syncing ', doc.id, model);
        await frappe.syncDoc(
          {
            doctype: model,
            ...doc
          },
          model
        );
      });
    } catch (ex) {
      console.error(ex);
    }

    console.log('registering', model);

    query.onSnapshot(function(querySnapshot) {
      console.log('received from firestore', querySnapshot.size, model);
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
