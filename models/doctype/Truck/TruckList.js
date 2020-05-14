//const { getActions } = require('../Transaction/Transaction');
//const InvoiceTemplate = require('../SalesInvoice/InvoiceTemplate.vue').default;
//const frappe = require('frappejs');
//const { _ } = require('frappejs/utils');

module.exports = {
  name: 'TruckList',
  doctype: 'DocType',
  label: 'Truck Lists',
  isSingle: 0,
  isChild: 0,
  keywordFields: ['name'],
  naming: 'name',
  fields: [
    {
      label: 'Name',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    }
    // {
    //   fieldname: 'numTrucks',
    //   label: 'No Of Trucks',
    //   fieldtype: 'Data',
    //   readOnly: 1,
    //   formula: doc => frappe.getAll('TruckListJunction')
    // }
  ]
};
