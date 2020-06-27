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

    await this.loadLink('permit');
    const permit = this.getLink('permit');
    this.type = permit.type;

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

  async afterUpdate() {
    await this.loadLink('permit');
    const permit = this.getLink('permit');
    if (permit.type !== 'I3MS') {
      const changed = await permit.applyFormula();
      console.log('before permit update', permit, changed);
      await permit.update();
    }
  }

  async afterInsert() {
    return this.afterUpdate();
  }
};
