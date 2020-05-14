module.exports = {
  name: 'TruckListJunction',
  label: 'TruckList Junction',
  naming: 'name',
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  settings: null,
  keywordFields: ['truckList', 'truck'],
  fields: [
    {
      fieldname: 'truckList',
      label: 'Truck List',
      fieldtype: 'Link',
      target: 'TruckList',
      placeholder: 'Select Truck List',
      required: 1
    },
    {
      fieldname: 'truck',
      label: 'Truck',
      fieldtype: 'Link',
      placeholder: 'Select Truck',
      required: 1
    }
  ],
  quickEditFields: ['truckList', 'truck']
};
