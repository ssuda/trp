const naming = require('frappejs/model/naming');
const Document = require('frappejs/model/document');

module.exports = class TripDocument extends Document {
  async beforeInsert() {
    if (this.name) return;
    const prefix = `${this.permit}/`;
    await naming.createNumberSeries(prefix, null, 1);
    this.name = await naming.getSeriesNext(prefix);
  }
};
