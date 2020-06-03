const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');
const { refreshPermit } = require('@/permit');

module.exports = class Permit extends BaseDocument {
  async afterInsert() {
    const numTrips = await this.getNumberOfTrips();

    if (
      this.type == 'I3MS' &&
      (!this.quantity || !this.startDate || !this.vehicleDetails || !numTrips)
    ) {
      refreshPermit(this);
    }
  }

  async getNumberOfTrips() {
    console.log('getNumberOfTrips called');

    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name as count')
        .sum('loadQty as sum')
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
    console.log('getQuantityDelivered called');
    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name as count')
        .sum('loadQty as sum')
    )[0];

    console.log('quantity', sum);

    this.numTrips = count;
    this.delivered = sum;
    return sum;
  }
};
