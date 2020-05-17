module.exports = {
  name: 'TruckList',
  doctype: 'DocType',
  label: 'Truck List',
  isSingle: 0,
  isChild: 0,
  keywordFields: ['name', 'numTrucks'],
  naming: 'name',
  documentClass: require('./TruckListDocument'),
  fields: [
    {
      label: 'Name',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1,
      placeholder: 'List Name'
    },
    {
      fieldname: 'trucks',
      label: 'Trucks',
      fieldtype: 'LongText',
      required: 1,
      placeholder: 'Paste Each Truck in New Line'
    },
    {
      fieldname: 'numTrucks',
      label: 'No Of Trucks',
      fieldtype: 'Data',
      readOnly: true,
      formula: doc =>
        doc.trucks ? doc.trucks.split('\n').filter(Boolean).length : ''
    }
  ],

  quickEditFields: ['name', 'trucks']
};
