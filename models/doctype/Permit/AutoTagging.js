const { _ } = require('frappejs/utils');

module.exports = {
  name: 'AutoTagging',
  doctype: 'DocType',
  label: _('Auto Tagging'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  documentClass: require('./AutoTaggingDocument'),
  keywordFields: ['source', 'transportedFrom', 'truckList', 'priority'],
  showTitle: false,
  fields: [
    {
      label: 'Requested By',
      fieldname: 'source',
      fieldtype: 'Data',
      required: 1
    },
    {
      label: 'Transported From',
      fieldname: 'transportedFrom',
      fieldtype: 'Data'
    },
    {
      fieldname: 'truckList',
      label: 'Truck List',
      fieldtype: 'Link',
      target: 'TruckList',
      placeholder: 'Truck List',
      required: 1
    },
    {
      fieldname: 'priority',
      label: 'Priority',
      fieldtype: 'Select',
      options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      required: 1
    }
  ],

  quickEditFields: [
    'truckList',
    'source',
    'transportedFrom',
    'priority'
  ]
};
