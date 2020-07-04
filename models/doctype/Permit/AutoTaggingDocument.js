const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');

module.exports = class AutoTaggingDocument extends BaseDocument {
  async validate() {
    this.source = this.source.trim();
    this.name = frappe.getRandomString();
    if (this.transportedFrom) {
      this.transportedFrom = this.transportedFrom.trim();
    }

    console.log('AutoTagging name', this.name);

    frappe.events.trigger('auto-tagging');
  }
};
