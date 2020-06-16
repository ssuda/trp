const frappe = require('frappejs');
const BaseDocument = require('frappejs/model/document');

module.exports = class AutoTaggingDocument extends BaseDocument {
  async validate() {
    this.source = this.source.trim();
    this.transportedFrom = this.transportedFrom.trim();
  }
};
