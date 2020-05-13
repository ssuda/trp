const { getActions } = require('../Transaction/Transaction');

module.exports = {
  name: 'Truck',
  doctype: 'DocType',
  label: 'Truck',
  //documentClass: require('./TruckDocument'),
  //printTemplate: InvoiceTemplate,
  isSingle: 0,
  isChild: 1,
  keywordFields: ['name', 'supplier'],
  tableFields: ['name', 'supplier'],
  showTitle: true,
  fields: [
    {
      fieldname: 'name',
      label: 'Truck Number',
      fieldtype: 'Data',
      placeholder: 'Truck Number',
      required: 1
    },
    {
      fieldname: 'supplier',
      label: 'Truck Owner',
      fieldtype: 'Link',
      target: 'Supplier',
      required: 0
    }
  ],

  actions: getActions('Truck')
};
