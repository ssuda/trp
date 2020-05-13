const { getActions } = require('../Transaction/Transaction');

module.exports = {
  name: 'Permit',
  doctype: 'DocType',
  label: 'Permit',
  //documentClass: require('./PurchaseInvoiceDocument'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: ['name', 'endDate', 'customer', 'quantity'],
  //settings: 'PurchaseInvoiceSettings',
  //showTitle: false,
  fields: [
    {
      label: 'Permit Number',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    },
    {
      fieldname: 'startDate',
      label: 'Start Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'endDate',
      label: 'Expiry Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'taggingUrl',
      label: 'Tagging Link',
      fieldtype: 'Date',
      hidden: true
    },
    {
      fieldname: 'vehicleDetails',
      label: 'Vehicle Details Link',
      fieldtype: 'Date',
      hidden: true
    },
    {
      fieldname: 'customer',
      label: 'Customer',
      fieldtype: 'Link',
      target: 'Customer'
    },
    {
      fieldname: 'account',
      label: 'I3MS Account',
      fieldtype: 'Link',
      target: 'I3MSAccount',
      required: true
    },
    {
      fieldname: 'quantity',
      label: 'Quantity',
      fieldtype: 'Float',
      required: true
    },
    {
      fieldname: 'tagged',
      label: 'Tagged',
      fieldtype: 'Text'
    }
  ],

  actions: getActions('Permit'),
  quickEditFields: ['name', 'startDate', 'endDate', 'account', 'quantity', 'customer']
};
