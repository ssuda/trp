const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');
const { refreshPermit } = require('@/permit');

module.exports = class Permit extends BaseDocument {
  afterInsert() {
    if (
      this.type == 'I3MS' &&
      (!this.quantity || !this.startDate || !this.vehicleDetails)
    ) {
      refreshPermit(this);
    }
  }

  async getNumberOfTrips() {
    console.log('name', this.name);

    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name')
        .sum('loadQty')
    )[0];

    this.numTrips = count;
    this.delivered = sum;

    console.log('trips', count);
    return count;
  }

  getNumberOfTagged() {
    console.log(this.tagged);
    const tagged = JSON.parse(this.tagged || '{}');

    if (tagged.success) {
      return tagged.success.length;
    }

    return Object.keys(tagged).length;
  }

  async getQuantityDelivered() {
    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name')
        .sum('loadQty')
    )[0];

    this.numTrips = count;
    this.delivered = sum;
    return sum;
  }
};
