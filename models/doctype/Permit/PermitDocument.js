const frappe = require('frappejs');
const BaseDocument = require('@/basedocument');

module.exports = class Permit extends BaseDocument {

  async getNumberOfTrips() {
    let { count } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name')
    )[0];

    console.log('trips', count);
    return count;
  }

  getNumberOfTagged() {
    console.log(this.tagged);
    const tagged = JSON.parse(this.tagged);

    if (tagged.success) {
      return tagged.success.length;
    }

    return Object.keys(tagged).length;
  }

  async getQuantityDelivered() {
    let { sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .sum('loadQty')
    )[0];

    return sum;
  }
};
