module.exports = {
  name: 'FuelSlip',
  doctype: 'DocType',
  label: 'Fuel Slip',
  //documentClass: require('./PurchaseInvoiceDocument'),
  isSingle: 0,
  isChild: 1,
  isSubmittable: 0,
  keywordFields: ['date', 'amount'],
  //settings: 'PurchaseInvoiceSettings',
  //showTitle: false,
  fields: [
    {
      fieldname: 'date',
      label: 'Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'amount',
      label: 'Amount',
      fieldtype: 'Currency'
    }
  ],

  quickEditFields: ['date', 'amount']
};
