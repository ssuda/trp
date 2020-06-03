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

    const { setupComplete } = frappe.AccountingSettings || {};

    if (setupComplete && doc.deviceId == deviceId) continue;

    try {
      for (let field in doc) {
        if (doc[field] && doc[field].toDate) {
          doc[field] = doc[field].toDate().toISOString();
        }
      }

      doc._turnOffSync = true;

      if (doc._deleted) {
        const frappedoc = await frappe.getDoc(model, doc.name);
        await frappedoc.delete();
      } else {
        console.log('Syncing from firestore', doc);
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

async function processQuery(query, model) {
  let startAfter;
  let offset = 0;

  while (true) {
    console.log('Starting to fetch at', offset, model);

    query = query.limit(200);

    if (startAfter) {
      query = query.startAfter(startAfter);
    }

    const snapshot = await query.get();

    console.log('No of docs', query, model, snapshot.size);

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
  let accountingSettings = frappe.AccountingSettings;
  if (!accountingSettings) {
    return;
  }

  const gstin = accountingSettings.gstin || frappe.currentUser.local.gstin;
  const lastSnapshot = accountingSettings.lastSnapshot;
  const timestamp = new Date().toISOString();

  console.log(gstin, lastSnapshot, timestamp);

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

    console.log(model, gstin);

    let query = firestore
      .collection(model)
      .orderBy('modified')
      .where('gstin', '==', gstin)
      .where('modified', '<', new Date(timestamp));

    if (lastSnapshot) {
      await processQuery(
        query.where('modified', '>=', new Date(lastSnapshot)),
        model
      );
    } else {
      await processQuery(query, model);
    }

    // //subscribe to new changes
    // let query = firestore
    //   .collection(model)
    //   .orderBy('modified')
    //   .where('gstin', '==', gstin)
    //   .on
  }

  console.log('All models synced');
  accountingSettings = frappe.AccountingSettings;
  await accountingSettings.update({
    lastSnapshot: timestamp,
    setupComplete: 1
  });
  frappe.AccountingSettings = accountingSettings;
  setTimeout(syncFromFirebase, 600000);
}

module.exports = syncFromFirebase;
