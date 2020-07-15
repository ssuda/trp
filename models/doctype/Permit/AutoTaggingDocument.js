const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');

module.exports = class AutoTaggingDocument extends BaseDocument {
  async validate() {
    this.source = this.source.trim();
    if (this.transportedFrom) {
      this.transportedFrom = this.transportedFrom.trim();
    }

    this.name = `${this.source}_${this.transportedFrom}`;

    frappe.AccountingSettings.update({ newPermitAlert: true });

    console.log('AutoTagging name', this.name);

    // setup auto tagging
    //frappe.events.trigger('auto-tagging', [this]);
  }
};
