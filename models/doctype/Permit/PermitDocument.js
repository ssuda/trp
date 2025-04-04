const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');
const { refreshPermit } = require('@/permit');

module.exports = class Permit extends BaseDocument {
  async afterInsert() {
    if (
      this.type == 'I3MS' &&
      (!this.quantity ||
        !this.startDate ||
        !this.taggingUrl ||
        this._turnOffSync)
    ) {
      refreshPermit(this);
    }
  }

  async getNumberOfTrips() {
    if (!this.source) {
      return 0;
    }
    console.log('getNumberOfTrips called');

    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name as count')
        .sum('loadQty as sum')
    )[0];

    this.numTrips = count || 0;
    this.delivered = sum || 0;

    console.log('trips', count);
    return count || 0;
  }

  getNumberOfTagged() {
    if (!this.source) {
      return 0;
    }
    console.log(this.tagged);
    const tagged = JSON.parse(this.tagged || '{}');

    if (tagged.success) {
      return tagged.success.length;
    }

    return Object.keys(tagged).filter(t => !tagged[t]).length;
  }

  async getQuantityDelivered() {
    if (!this.source) {
      return 0;
    }

    console.log('getQuantityDelivered called');
    let { count, sum } = (
      await frappe.db
        .knex('Trip')
        .where('permit', this.name)
        .count('name as count')
        .sum('loadQty as sum')
    )[0];

    this.numTrips = count || 0;
    this.delivered = sum || 0;
    return sum || 0;
  }
};
