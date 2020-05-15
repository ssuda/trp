const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');

module.exports = class Permit extends BaseDocument {
  async getNumberOfTrips() {
    let { count } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name as count')
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
        .sum('loadQty as sum')
    )[0];

    return sum;
  }
};
