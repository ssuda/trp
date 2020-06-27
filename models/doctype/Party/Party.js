const frappe = require('frappejs');
let { _ } = require('frappejs/utils');

module.exports = {
  name: 'Party',
  label: 'Party',
  keywordFields: ['name'],
  fields: [
    {
      fieldname: 'name',
      label: 'Name',
      fieldtype: 'Data',
      required: 1,
      placeholder: 'Full Name'
    },
    // {
    //   fieldname: 'gstin',
    //   label: 'GSTIN No.',
    //   fieldtype: 'Data',
    //   placeholder: '29AAGCB7383J1Z1'
    // },
    // {
    //   fieldname: 'pan',
    //   label: 'PAN',
    //   fieldtype: 'Data',
    //   placeholder: 'ABCDE1234F'
    // },
    {
      fieldname: 'image',
      label: 'Image',
      fieldtype: 'AttachImage'
    },
    {
      fieldname: 'customer',
      label: 'Customer',
      fieldtype: 'Check'
    },
    {
      fieldname: 'supplier',
      label: 'Supplier',
      fieldtype: 'Check'
    },
    {
      fieldname: 'defaultAccount',
      label: 'Default Account',
      fieldtype: 'Link',
      target: 'Account',
      getFilters: (query, doc) => {
        return {
          isGroup: 0,
          accountType: doc.customer ? 'Receivable' : 'Payable'
        };
      },
      formula: doc => {
        if (doc.customer) {
          return 'Debtors';
        }
        if (doc.supplier) {
          return 'Creditors';
        }
      }
    },
    {
      fieldname: 'outstandingAmount',
      label: 'Outstanding Amount',
      fieldtype: 'Currency'
    },
    {
      fieldname: 'currency',
      label: 'Currency',
      fieldtype: 'Link',
      target: 'Currency',
      placeholder: 'INR',
      formula: () => frappe.AccountingSettings.currency
    },
    {
      fieldname: 'email',
      label: 'Email',
      fieldtype: 'Data',
      placeholder: 'john@doe.com',
      validate: {
        type: 'email'
      }
    },
    {
      fieldname: 'phone',
      label: 'Phone',
      fieldtype: 'Data',
      placeholder: 'Phone',
      validate: {
        type: 'phone'
      }
    },
    {
      fieldname: 'address',
      label: 'Address',
      fieldtype: 'Link',
      target: 'Address',
      placeholder: _('Click to create'),
      inline: true
    },
    {
      fieldname: 'addressDisplay',
      label: 'Address Display',
      fieldtype: 'Text',
      readOnly: true,
      formula: doc => {
        if (doc.address) {
          return doc.getFrom('Address', doc.address, 'addressDisplay');
        }
      }
    }
  ],

  quickEditFields: [
    'email',
    'phone',
    'pan',
    'gstin',
    'address',
    //'defaultAccount',
    //'currency'
  ]
};
