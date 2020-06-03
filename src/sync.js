const frappe = require('frappejs');
const { firestore } = require('@/firebase');
const { DateTime } = require('luxon');
const { machineIdSync } = require('node-machine-id');
const { syncDoc } = require('@/utils');

let deviceId = machineIdSync({ original: true });

async function processRecord(docs, model) {
  console.log('Syncing', model);

  await frappe.db.sql('PRAGMA foreign_keys = OFF');
  for (let doc of docs) {
    doc = doc.data();

    if (doc.deviceId == deviceId) continue;
    console.log('Inside Syncing', model);

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
        if (model == 'AccountingSettings') {
          console.log('syncing', model, doc);
        }
        const r = await syncDoc({
          doctype: model,
          ...doc
        });

        if (model == 'AccountingSettings') {
          console.log('synced', model, doc, r);
        }
      }
    } catch (ex) {
      console.error(ex);
    }
  }
  await frappe.db.sql('PRAGMA foreign_keys = ON');
  console.log('Syncing completed', model);
}

module.exports = async function() {
  // check with firestore about updates and subscribe to the changes
  const accountingSettings = frappe.AccountingSettings;
  if (!accountingSettings) {
    return;
  }

  const gstin = accountingSettings.gstin || frappe.currentUser.local.gstin;

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

    // check latest modified time for each doctype and register for changes

    const modelDef = frappe.models[model];

    const table = modelDef.isSingle
      ? 'SingleValue'
      : modelDef.basedOn || modelDef.name;

    console.log(model, gstin, table);

    let query = firestore
      .collection(model)
      .orderBy('modified')
      .where('gstin', '==', gstin);

    try {
      if (accountingSettings.setupComplete) {
        const row = await frappe.db.knex.raw(
          `select modified from ${table} order by modified limit 1`
        );

        if (row.length) {
          console.log(model, 'last modified', model, row[0]);
          query = query.where('modified', '>=', row[0].modified);
        }
      }
    } catch (ex) {
      console.error(ex);
    }

    console.log('registering', model);

    query.onSnapshot(async function(querySnapshot) {
      console.log('received from firestore', querySnapshot.size, model);
      processRecord(querySnapshot.docs, model);
    });
  }
};
