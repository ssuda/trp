const BaseDocument = require('frappejs/model/document');

const { extractTrucks } = require('@/utils');

module.exports = class TruckList extends BaseDocument {
  async validate() {
    const trucks = extractTrucks(this.trucks);
    this.trucks = trucks.map(s => s.toUpperCase()).join('\n');
    this.numTrucks = trucks.length;
  }
};
