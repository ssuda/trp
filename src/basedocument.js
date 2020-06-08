const Observable = require('frappejs/utils/observable');
const frappe = require('frappejs');

const { firestore, FieldValue } = require('@/firebase');

const { machineIdSync } = require('node-machine-id');

let deviceId = machineIdSync({ original: true });

function isNullOrUndefined(val) {
  return val == null || typeof val == 'undefined';
}

module.exports = class BaseDocument extends Observable {
  // trigger methods on the class if they match
  // with the trigger name
  async trigger(event, params) {
    if (this[event]) {
      await this[event](params);
    }
    await super.trigger(event, params);

    if (this._turnOffSync || frappe._turnOffSync) {
      console.log('Not syncing to firestore, as it is from firestore');
      return;
    }

    if (
      ['Tax', 'Currency', 'GetStarted', 'SingleValue'].includes(this.doctype)
    ) {
      return;
    }

    const accountingSettings = frappe.AccountingSettings || {};
    let gstin =
      accountingSettings.gstin ||
      this.gstin ||
      (frappe.currentUser && frappe.currentUser.gstin);

    if (!gstin) {
      return;
    }

    let key = `${gstin}_${this.name.replace(/[ \/]/g, '_')}`;

    if (event === 'afterDelete') {
      if (this.doctype == 'SpinBiUser') {
        await firestore
          .collection('SpinBiUser')
          .doc(this.email)
          .set(
            {
              gstins: {
                [frappe.AccountingSettings.gstin]: false
              },
              companies: {
                [frappe.AccountingSettings.companyName]: false
              }
            },
            { merge: true }
          );
        return;
      }

      await firestore
        .collection(this.doctype)
        .doc(key)
        .update({
          _deleted: true
        });
    } else if (event === 'afterUpdate' || event === 'afterInsert') {
      if (this.doctype === 'Trip' && !this.endDate) {
        return;
      }

      if (this.doctype === 'AccountingSettings' && !this.setupComplete) {
        return;
      }

      if (this.doctype === 'Truck' && !this.supplier) {
        return;
      }

      let obj = {
        gstin,
        deviceId
      };

      for (let param in this) {
        if (
          typeof this[param] !== 'object' &&
          !param.startsWith('_') &&
          !['flags', 'fetchValuesCache'].includes(param)
        ) {
          if (param === 'modified') {
            obj[param] = FieldValue.serverTimestamp();
          } else {
            obj[param] = this[param];
          }
        }
      }

      if (this.doctype == 'SpinBiUser') {
        key = `${this.name.replace(/[ \/]/g, '_')}`;
        obj.gstins = {
          [gstin]: true
        };
        obj.companies = {
          [frappe.AccountingSettings.companyName]: true
        };
      }

      console.log('Syncing to firestore', this.doctype);
      firestore
        .collection(this.doctype)
        .doc(key)
        .set(obj, { merge: true });
    }
  }

  async compareWithCurrentDoc() {
    if (frappe.isServer && !this.isNew()) {
      let currentDoc = await frappe.db.get(this.doctype, this.name);

      //delete null or undefined in both the documents
      for (let field in currentDoc) {
        if (
          isNullOrUndefined(this[field]) &&
          isNullOrUndefined(currentDoc[field])
        ) {
          delete this[field];
        }
      }

      // check for conflict
      if (
        currentDoc &&
        currentDoc.modified &&
        this.modified != currentDoc.modified
      ) {
        throw new frappe.errors.Conflict(
          frappe._('Document {0} {1} has been modified after loading', [
            this.doctype,
            this.name
          ])
        );
      }

      if (this.submitted && !this.meta.isSubmittable) {
        throw new frappe.errors.ValidationError(
          frappe._('Document type {1} is not submittable', [this.doctype])
        );
      }

      // set submit action flag
      if (this.submitted && !currentDoc.submitted) {
        this.flags.submitAction = true;
      }

      if (currentDoc.submitted && !this.submitted) {
        this.flags.revertAction = true;
      }
    }
  }
};
