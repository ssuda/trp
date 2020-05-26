const naming = require('frappejs/model/naming');
const Document = require('frappejs/model/document');
const frappe = require('frappejs');

module.exports = class TripDocument extends Document {
  async validate() {
    if (!this.isNew()) {
      return;
    }

    if (!this.lrNumber) {
      throw new Error('LR Number is required');
    }

    let values = await frappe.db.getAll({
      doctype: 'Trip',
      fields: ['lrNumber'],
      filters: { lrNumber: this.lrNumber, permit: this.permit },
      limit: 1
    });

    if (values && values.length) {
      throw new Error('Duplicate LR Number');
    }
  }

  async beforeInsert() {
    const prefix = `${this.permit}/`;
    if (this.name.includes(prefix)) {
      return;
    }
    await naming.createNumberSeries(prefix, null, 0);
    this.name = await naming.getSeriesNext(prefix);
    console.log('after naming', this.name);
  }

  async afterInsert() {
    const permit = await frappe.getDoc('Permit', this.permit);
    await permit.update();
  }
};
