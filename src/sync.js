const frappe = require('frappejs');
const { firestore, FieldValue } = require('@/firebase');
const { machineIdSync } = require('node-machine-id');
const { syncDoc } = require('@/utils');

const { tagRelease } = require('@/permit');
const { DateTime } = require('luxon');

const { readTP } = require('@/i3ms-sync');

let deviceId = machineIdSync({ original: true });

async function readLatestTP(lastSnapshot) {
  let time = DateTime.fromISO(lastSnapshot);

  if (frappe.AccountingSettings.i3msFirstTimeSync) {
    time = time.minus({ months: 1 }).startOf('month');
    await frappe.AccountingSettings.update({
      i3msFirstTimeSync: 0
    });
  } else {
    time = time.minus({ hours: 1 });
  }

  const rows = await readTP({
    StartDate: {
      _gte: time
    }
  });

  console.log('response from hasura');

  const failed = [];
  console.log('number of records from hasura', rows.length);

  for (let doc of rows) {
    await syncDoc({
      doctype: 'Permit',
      name: doc.Permit,
      type: 'I3MS',
      destination: doc.Destination,
      material: doc.Mineral,
      source: doc.LicenseeName,
      transportedFrom: doc.Source,
      circle: doc.Circle,
      _turnOffSync: true
    });

    try {
      await syncDoc({
        doctype: 'Trip',
        permit: doc.Permit,
        name: doc.TPNo,
        truck: doc.VehicleNo,
        tpNumber: doc.TPNo,
        startDate: doc.StartDate,
        loadQty: doc.Weight
      });
    } catch (ex) {
      failed.push({
        doctype: 'Trip',
        permit: doc.Permit,
        name: doc.TPNo,
        truck: doc.VehicleNo,
        tpNumber: doc.TPNo,
        startDate: doc.StartDate,
        loadQty: doc.Weight
      });
    }
  }

  for (let doc of failed) {
    await syncDoc(doc);
  }
}

async function processRecord(docs, model) {
  console.log('Syncing', model, docs.length);

  await frappe.db.sql('PRAGMA foreign_keys = OFF');
  for (let doc of docs) {
    if (model === 'PermitRequest') {
      return tagRelease(doc);
    }

    doc = doc.data();

    const { setupComplete, i3msUsername, i3msPassword } =
      frappe.AccountingSettings || {};

    if (setupComplete && doc.deviceId == deviceId) continue;

    try {
      for (let field in doc) {
        if (model === 'Permit' && field === 'tagged' && doc[field]) {
          doc[field] = JSON.stringify(doc[field]);
        } else if (doc[field] && doc[field].toDate) {
          doc[field] = doc[field].toDate().toISOString();
        } else if (Array.isArray(doc[field])) {
          delete doc[field];
        }
      }

      doc._turnOffSync = true;

      if (doc._deleted) {
        const frappedoc = await frappe.getDoc(model, doc.name);
        await frappedoc.delete();
      } else {
        console.log('Syncing from firestore', doc);
        if (model === 'AccountingSettings') {
          doc.i3msUsername = i3msUsername;
          doc.i3msPassword = i3msPassword;
        }
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

let alreadySubscribed = false;

async function syncFromFirebase() {
  // check with firestore about updates and subscribe to the changes
  let accountingSettings = frappe.AccountingSettings;
  if (!accountingSettings) {
    return;
  }

  const gstin = accountingSettings.gstin || frappe.currentUser.local.gstin;
  const lastSnapshot = accountingSettings.lastSnapshot;

  const timestampRef = firestore.collection('timestamp').doc('timestamp');
  await timestampRef.set({ timestamp: FieldValue.serverTimestamp() });
  let timestamp = await timestampRef.get();
  timestamp = timestamp.get('timestamp');

  if (timestamp) {
    timestamp = timestamp.toDate();
  } else {
    timestamp = DateTime.local().toJSDate();
  }

  //readLatestTP(lastSnapshot);

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
    if (model != 'PermitRequest') {
      let query = firestore
        .collection(model)
        .orderBy('modified')
        .where('modified', '<', timestamp);

      if (model === 'SpinBiUser') {
        query = query.where('gstins', 'array-contains', gstin);
      } else {
        query = query.where('gstin', '==', gstin);
      }

      if (lastSnapshot) {
        await processQuery(
          query.where('modified', '>=', new Date(lastSnapshot)),
          model
        );
      } else {
        await processQuery(query, model);
      }
    }

    if (!alreadySubscribed && model == 'PermitRequest') {
      //subscribe to realtime changes
      firestore
        .collection(model)
        .where('gstin', '==', gstin)
        .onSnapshot(function(querySnapshot) {
          processRecord(querySnapshot.docs, model);
        });
    } else if (!alreadySubscribed && frappe.globalConfig.realtimeSync) {
      alreadySubscribed = true;
      //subscribe to realtime changes
      firestore
        .collection(model)
        .orderBy('modified')
        .where('gstin', '==', gstin)
        .where('modified', '>=', timestamp)
        .onSnapshot(function(querySnapshot) {
          processRecord(querySnapshot.docs, model);
        });
    }
  }

  console.log('All models synced');
  accountingSettings = frappe.AccountingSettings;
  await accountingSettings.update({
    lastSnapshot: timestamp.toISOString(),
    setupComplete: 1
  });
  frappe.AccountingSettings = accountingSettings;
  setTimeout(syncFromFirebase, 600000);
}

module.exports = syncFromFirebase;
