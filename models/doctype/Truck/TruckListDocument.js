const BaseDocument = require('frappejs/model/document');
const regexp = /[A-Z]{2}[0-9]{1,2}(?:[A-Z])?(?:[A-Z]*)?[0-9]{4}/gi;

module.exports = class TruckList extends BaseDocument {
  async validate() {
    const trucks = Array.from(this.trucks.matchAll(regexp), m => m[0]);
    this.trucks = trucks.map(s => s.toUpperCase()).join('\n');
    this.numTrucks = trucks.length;
  }
};
