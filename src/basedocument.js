const Observable = require('frappejs/utils/observable');
const frappe = require('frappejs');

const { firestore } = require('@/firebase');

const { machineIdSync } = require('node-machine-id');

let deviceId = machineIdSync({ original: true });

module.exports = class BaseDocument extends Observable {
  // trigger methods on the class if they match
  // with the trigger name
  async trigger(event, params) {
    if (this[event]) {
      await this[event](params);
    }
    await super.trigger(event, params);

    const accountingSettings = frappe.AccountingSettings;
    if (!accountingSettings) {
      return;
    }

    if (event === 'afterUpdate' || event === 'afterInsert') {
      if (
        event === 'afterInsert' &&
        this.doctype === 'Trip' &&
        !this.endDate
      ) {
        return;
      }

      let obj = {
        gstin: accountingSettings.gstin,
        deviceId
      };

      for (let param in this) {
        if (
          typeof this[param] !== 'object' &&
          !param.startsWith('_') &&
          !['flags', 'fetchValuesCache'].includes(param)
        ) {
          if (param === 'modified') {
            obj[param] = new Date(this[param]);
          } else {
            obj[param] = this[param];
          }
        }
      }

      firestore
        .collection(this.doctype)
        .doc(`${accountingSettings.gstin}_${this.name.replace(/[ \/]/g, '_')}`)
        .set(obj);
    }
  }

  async compareWithCurrentDoc() {
    if (frappe.isServer && !this.isNew()) {
      let currentDoc = await frappe.db.get(this.doctype, this.name);

      // if (typeof (this.modified) === 'string') {
      //   this.modified = new Date(this.modified);
      // }

      // if (typeof (currentDoc.modified) === 'string') {
      //   currentDoc.modified = new Date(currentDoc.modified);
      // }

      // // check for conflict
      // console.log(
      //   'modified',
      //   this.modified,
      //   currentDoc.modified,
      //   typeof this.modified,
      //   new Date(this.modified).getTime() == new Date(currentDoc.modified).getTime()
      // );

      // if (
      //   currentDoc &&
      //   this.modified.getTime() != currentDoc.modified.getTime()
      // ) {
      //   throw new frappe.errors.Conflict(
      //     frappe._('Document {0} {1} has been modified after loading', [
      //       this.doctype,
      //       this.name
      //     ])
      //   );
      // }

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
