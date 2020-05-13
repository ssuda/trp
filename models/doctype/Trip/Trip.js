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
    'lrNumber',
    'startDate',
    'endDate',
    'permit',
    'loadQty',
    'unloadQty'
  ],
  //settings: 'PurchaseInvoiceSettings',
  //showTitle: false,
  fields: [
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
      label: 'Truck',
      fieldname: 'truck',
      fieldtype: 'Link',
      target: 'Truck'
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
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'endDate',
      label: 'End Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'tpNumber',
      label: 'TP No',
      fieldtype: 'Data'
    },
    {
      fieldname: 'tpUrl',
      label: 'TP Link',
      fieldtype: 'Data',
      hidden: true
    },
    {
      fieldname: 'loadQty',
      label: 'Loaded Quantity',
      fieldtype: 'Float'
    },
    {
      fieldname: 'unloadQty',
      label: 'Unloaded Quantity',
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
      fieldtype: 'Link',
      target: 'FuelSlip'
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
