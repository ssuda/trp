const naming = require('frappejs/model/naming');
const Document = require('frappejs/model/document')

module.exports = class TripDocument extends Document {
  async beforeInsert() {
    const prefix = `${this.permit}/`;
    if (this.name.includes(prefix)) {
      return;
    }
    await naming.createNumberSeries(prefix, null, 0);
    this.name = await naming.getSeriesNext(prefix);
    console.log('after naming', this.name);
  }
};
