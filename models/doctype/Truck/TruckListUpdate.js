module.exports = {
  name: 'TruckListUpdate',
  doctype: 'DocType',
  label: 'Update Truck List',
  isSingle: 1,
  isChild: 0,
  showTitle: false,
  fields: [
    {
      fieldname: 'truckList',
      label: 'Truck List',
      fieldtype: 'Link',
      target: 'TruckList',
      placeholder: 'Truck List',
      required: 1
    },
    {
      fieldname: 'image',
      label: 'Truck List Image',
      fieldtype: 'AttachImage',
      required: 1,  
    },
    {
      fieldname: 'trucks',
      label: 'Trucks',
      fieldtype: 'LongText',
      required: 1,
      placeholder: 'Paste Each Truck in New Line'
    },
  ],
};
