module.exports = {
  name: 'PermitAction',
  doctype: 'DocType',
  label: 'Permit Action',
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
      label: 'Label',
      fieldname: 'label',
      fieldtype: 'Data'
    },
    {
      fieldname: 'permit',
      label: 'Permit',
      fieldtype: 'Link',
      target: 'Permit'
    },
    {
      fieldname: 'account',
      label: 'I3MS Account',
      fieldtype: 'Link',
      target: 'I3MSAccount',
      formula: doc => doc.permit && doc.permit.account,
      required: true
    },
    {
      fieldname: 'truckList',
      label: 'Truck List',
      fieldtype: 'Link',
      target: 'TruckList'
    },
    {
      fieldname: 'action',
      label: 'Action',
      fieldtype: 'Data',
      required: true
    }
  ]
};
