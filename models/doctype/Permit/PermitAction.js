const frappe = require('frappejs');

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
      fieldname: 'showBrowser',
      label: 'Show Browsers',
      fieldtype: 'Check',
      default: 1
    },
    {
      fieldname: 'numBrowsers',
      label: 'Number of Browsers (1 to 10)',
      fieldtype: 'Data'
      // default: () =>
      //   frappe.AccountingSettings.email == 'samba@spinbi.com' ? 20 : 4
    },
    {
      fieldname: 'scheduledAt',
      label: 'Scheduled At',
      fieldtype: 'Data'
    },
    {
      fieldname: 'username',
      label: 'I3MS Username',
      fieldtype: 'Data'
    },
    {
      fieldname: 'password',
      label: 'I3MS Password',
      fieldtype: 'Password'
    },
    {
      fieldname: 'taggingUrl',
      label: 'Tagging Link',
      fieldtype: 'Data',
      placeholder: 'Tagging Link'
    },
    {
      fieldname: 'isCloudTagging',
      label: 'Tagging in Server? (Tagging will happen remotely in cloud)',
      fieldtype: 'Check',
      placeholder: 'Tagging in Server?'
      // default: () =>
      //   frappe.AccountingSettings.email == 'samba@spinbi.com' ? 1 : 0
    },
    {
      fieldname: 'refreshPermit',
      label: 'Refresh Permit Before Tagging',
      fieldtype: 'Check',
      placeholder: 'Refresh Permit',
      default: 0
      // default: () =>
      //   frappe.AccountingSettings.email == 'samba@spinbi.com' ? 1 : 0
    },
    {
      fieldname: 'truckList',
      label: 'Truck List',
      fieldtype: 'Link',
      target: 'TruckList',
      placeholder: 'Truck List'
    },
    {
      fieldname: 'trucks',
      label: 'Trucks',
      fieldtype: 'LongText',
      placeholder: 'Paste Each Truck in New Line'
    },
    {
      fieldname: 'gstin',
      label: 'GSTN',
      fieldtype: 'Data'
    },
    {
      fieldname: 'action',
      label: 'Action',
      fieldtype: 'Data',
      required: true
    },
    {
      fieldname: 'buttonText',
      label: 'Button Text',
      fieldtype: 'Data',
      required: true
    }
  ]
};
