module.exports = {
  name: 'Truck',
  doctype: 'DocType',
  label: 'Truck',
  //documentClass: require('./TruckDocument'),
  //printTemplate: InvoiceTemplate,
  isSingle: 0,
  isChild: 0,
  keywordFields: ['name', 'supplier', 'passingWeight', 'wheels'],
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
      fieldname: 'wheels',
      label: 'Number Of Wheels',
      fieldtype: 'Int',
    },
    {
      fieldname: 'passingWeight',
      label: 'Passing Weight',
      fieldtype: 'Float',
    },
    {
      fieldname: 'supplier',
      label: 'Truck Owner',
      fieldtype: 'Link',
      target: 'Supplier',
      required: 0
    }
  ],

  quickEditFields: ['name', 'supplier', 'passingWeight', 'wheels']
};
