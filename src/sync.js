const frappe = require('frappejs');
const { firestore } = require('@/firebase');
//const { DateTime } = require('luxon');
const { machineIdSync } = require('node-machine-id');
const { syncDoc } = require('@/utils');

let deviceId = machineIdSync({ original: true });

async function processRecord(docs, model) {
  console.log('Syncing', model);

  await frappe.db.sql('PRAGMA foreign_keys = OFF');
  for (let doc of docs) {
    doc = doc.data();

    if (doc.deviceId == deviceId) continue;
    try {
      for (let field in doc) {
        if (doc[field] && doc[field].toDate) {
          doc[field] = doc[field].toDate().toISOString();
        }
      }

      if (doc._deleted) {
        const frappedoc = await frappe.getDoc(model, doc.name);
        await frappedoc.delete();
      } else {
        await syncDoc({
          doctype: model,
          ...doc
        });
      }
    } catch (ex) {
      console.error(ex);
    }
  }
  await frappe.db.sql('PRAGMA foreign_keys = ON');
  console.log('Syncing completed', model);
}

async function processQuery(query) {
  let startAfter;
  let offset = 0;

  while (true) {
    console.log('Starting to fetch at', offset, model);

    query = query.limit(200);

    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    const snapshot = await query.get();

    if (snapshot.size == 0) {
      console.log('No documents ending');
      break;
    }

    offset += snapshot.size;

    startAfter = snapshot.docs[snapshot.docs.length - 1];
    await processRecord(snapshot.docs, model);

    if (snapshot.size < 200) {
      console.log('No documents ending');
      break;
    }
  }
}

async function syncFromFirebase() {
  // check with firestore about updates and subscribe to the changes
  const accountingSettings = frappe.AccountingSettings;
  if (!accountingSettings) {
    return;
  }

  const gstin = accountingSettings.gstin || frappe.currentUser.local.gstin;
  const lastSnapshot = accountingSettings.lastSnapshot;

  const timestamp = new Date().toISOString();

  for (let model in frappe.models) {
    if (
      [
        'Tax',
        'Currency',
        'GetStarted',
        'SetupWizard',
        'LoginRegister',
        'PermitAction'
      ].includes(model)
    ) {
      continue;
    }

    console.log(model, gstin, table);

    let query = firestore
      .collection(model)
      .orderBy('modified')
      .where('gstin', '==', gstin);

    if (lastSnapshot) {
      await processQuery(
        query
          .where('modified', '>=', lastSnapshot)
          .where('modified', '<', timestamp)
      );
    } else {
      await processQuery(query);
    }
  }

  console.log('All models synced');

  await syncDoc({
    doctype: 'AccountingSettings',
    lastSnapshot
  });

  setTimeout(syncFromFirebase, 120000);
}

module.exports = syncFromFirebase;
