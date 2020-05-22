const { getActions } = require('../Transaction/Transaction');

module.exports = {
  name: 'Trip',
  doctype: 'DocType',
  label: 'Trip',
  //documentClass: require('./PurchaseInvoiceDocument'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: [
    'name',
    'lrNumber',
    'permit',
    'truck',
    'loadQty',
    'unloadQty',
    'startDate',
    'endDate'
  ],

  importFields: [
    'tpNumber',
    'endDate',
    'unloadQty',
    'advance',
    'discount',
    'fuel'
  ],

  //settings: 'PurchaseInvoiceSettings',
  showTitle: true,
  fields: [
    {
      label: 'Name',
      fieldname: 'name',
      fieldtype: 'Data'
    },
    {
      label: 'Permit',
      fieldname: 'permit',
      fieldtype: 'Link',
      target: 'Permit'
    },
    // {
    //   label: 'Delivery Order',
    //   fieldname: 'order',
    //   fieldtype: 'Link',
    //   target: 'Delivery Order'
    // },
    {
      label: 'Truck No',
      fieldname: 'truck',
      fieldtype: 'Link',
      target: 'Truck',
      readOnly: doc => doc.permit
    },
    {
      fieldname: 'lrNumber',
      label: 'LR Number',
      fieldtype: 'Data'
    },
    {
      fieldname: 'startDate',
      label: 'Start Date',
      fieldtype: 'Date',
      readOnly: true
    },
    {
      fieldname: 'endDate',
      label: 'End Date',
      fieldtype: 'Date'
    },
    {
      fieldname: 'tpNumber',
      label: 'TP No',
      fieldtype: 'Data',
      readOnly: true
    },
    {
      fieldname: 'tpUrl',
      label: 'TP Link',
      fieldtype: 'Data',
      hidden: true,
      readOnly: true
    },
    {
      fieldname: 'loadQty',
      label: 'Loaded',
      fieldtype: 'Float'
    },
    {
      fieldname: 'unloadQty',
      label: 'Unloaded',
      fieldtype: 'Float'
    },
    {
      fieldname: 'discount',
      label: 'Discount',
      fieldtype: 'Currency'
    },
    {
      fieldname: 'advance',
      label: 'Advance',
      fieldtype: 'Currency'
    },
    {
      fieldname: 'fuel',
      label: 'Fuel',
      fieldtype: 'Currency'
    }
  ],

  actions: getActions('Permit'),
  quickEditFields: [
    'permit',
    'truck',
    'lrNumber',
    'startDate',
    'endDate',
    'loadQty',
    'unloadQty',
    'discount',
    'advance',
    'fuel'
  ]
};
