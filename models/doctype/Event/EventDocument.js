const frappe = require('frappejs');
const BaseDocument = require('@/basedocument');

module.exports = class Event extends BaseDocument {
    alertEvent() {
        alert(this.title);
    }
}
