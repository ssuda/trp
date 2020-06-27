module.exports = {
  name: 'Trip',
  doctype: 'DocType',
  label: 'Trip',
  documentClass: require('./TripDocument'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: [
    'name',
    'lrNumber',
    'permit',
    'truck',
    'fuelPump',
    'driverPhone',
    'driverLicense',
    'ewbno'
  ],

  importFields: [
    'name',
    'lrNumber',
    'startDate',
    'endDate',
    'loadQty',
    'unloadQty',
    'advance',
    'discount',
    'fuel',
    'fuelPump',
    'driverPhone',
    'driverLicense',
    'ewbno',
    'docNo'
  ],

  showTitle: true,
  fields: [
    {
      label: 'Trip Number',
      fieldname: 'name',
      fieldtype: 'Data',
      readOnly: true
    },
    {
      label: 'Order',
      fieldname: 'permit',
      fieldtype: 'Link',
      target: 'Permit'
    },
    {
      label: 'Truck No',
      fieldname: 'truck',
      fieldtype: 'Link',
      target: 'Truck'
      //readOnly: doc => !doc.isNew()
    },
    {
      fieldname: 'lrNumber',
      label: 'LR Number',
      placeholder: 'LR Number',
      fieldtype: 'Data'
    },
    {
      fieldname: 'docNo',
      label: 'Invoice/Challan Number',
      fieldtype: 'Data'
    },
    {
      fieldname: 'startDate',
      label: 'Start Date',
      fieldtype: 'Date'
      //readOnly: doc => !doc.isNew()
    },
    {
      fieldname: 'endDate',
      label: 'End Date',
      fieldtype: 'Date'
    },
    {
      fieldname: 'tpNumber',
      label: 'TP No',
      fieldtype: 'Data',
      readOnly: true
    },
    {
      fieldname: 'tpUrl',
      label: 'TP Link',
      fieldtype: 'Data',
      hidden: true,
      readOnly: true
    },
    {
      fieldname: 'loadQty',
      label: 'Loaded',
      fieldtype: 'Float'
    },
    {
      fieldname: 'unloadQty',
      label: 'Unloaded',
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
      fieldtype: 'Currency'
    },
    {
      fieldname: 'fuelPump',
      label: 'Fuel Pump',
      fieldtype: 'Data'
    },
    {
      fieldname: 'driver',
      label: 'Driver',
      fieldtype: 'Link',
      target: 'Driver'
    },
    {
      fieldname: 'driverPhone',
      label: 'Driver Phone',
      fieldtype: 'Data',
      formula: doc => doc.driver.phoneNumber,
      readOnly: true,
    },
    {
      fieldname: 'driverLicense',
      label: 'Driver License',
      fieldtype: 'Data',
      formula: doc => doc.driver.license,
      readOnly: true
    },
    {
      fieldname: 'type',
      label: 'Type',
      fieldtype: 'Data',
      default: 'I3MS',
      hidden: true
    },
    {
      fieldname: 'ewbno',
      label: 'Ewaybill No',
      fieldtype: 'Data',
      hidden: doc => doc.type != 'I3MS'
    },
  ],

  quickEditFields: [
    'permit',
    'truck',
    'lrNumber',
    'docNo',
    'driver',
    'ewbno',
    'startDate',
    'endDate',
    'loadQty',
    'unloadQty',
    'discount',
    'advance',
    'fuel',
    'fuelPump',
  ]
};
