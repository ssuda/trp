module.exports = {
  name: 'PermitRequest',
  doctype: 'DocType',
  label: 'Permit Request',
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: [],
  showTitle: false,
  fields: [
    {
      label: 'Name',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    },
    {
      label: 'truckNo',
      fieldname: 'Truck No',
      fieldtype: 'Data'
    },
    {
      fieldname: 'permit',
      label: 'Permit',
      fieldtype: 'Link',
      target: 'Permit'
    }
  ]
};
