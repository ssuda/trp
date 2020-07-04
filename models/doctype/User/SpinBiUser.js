const { _ } = require('frappejs/utils');
const frappe = require('frappejs');
const accountingSettings = frappe.AccountingSettings || {};

module.exports = {
  name: 'SpinBiUser',
  label: _('User'),
  doctype: 'DocType',
  isSingle: 0,
  isChild: 0,
  documentClass: require('./SpinBiUserDocument'),
  keywordFields: ['name', 'fullName', 'phoneNumber', 'role'],
  fields: [
    {
      fieldname: 'fullName',
      label: 'Full Name',
      fieldtype: 'Data',
      required: 1
    },
    {
      fieldname: 'name',
      label: 'Email',
      fieldtype: 'Data',
      required: 1,
      placeholder: 'Email'
    },
    {
      fieldname: 'phoneNumber',
      label: 'Phone Number',
      fieldtype: 'Data'
    },
    {
      fieldname: 'password',
      label: 'Password',
      fieldtype: 'Password',
      required: 1
    },
    {
      fieldname: 'role',
      label: 'Role',
      fieldtype: 'Select',
      placeholder: 'Role',
      required: 1,
      default: 'Operator',
      options: ['Administrator', 'Operator', 'Verifier', 'Account Manager']
    },
    {
      fieldname: 'status',
      label: 'Status',
      fieldtype: 'Select',
      required: 1,
      default: 'Active',
      options: ['Active', 'In Active']
    },
    {
      fieldname: 'userId',
      label: 'User ID',
      fieldtype: 'Data',
      hidden: 1
    },
    {
      fieldname: 'gstin',
      label: 'GSTN',
      fieldtype: 'Data',
      hidden: 1,
      formula: doc => accountingSettings.gstin
    },
    {
      fieldname: 'companyName',
      label: 'Company Name',
      fieldtype: 'Data',
      hidden: 1,
      formula: doc => accountingSettings.companyName
    },
    {
      fieldname: 'canTag',
      label: 'Can Tag',
      fieldtype: 'Check',
      default: 1
    },
    {
      fieldname: 'canRelease',
      label: 'Can Release',
      fieldtype: 'Check',
      default: 1
    },
    {
      fieldname: 'canCreateTrip',
      label: 'Can Create Trip',
      fieldtype: 'Check',
      default: 1
    },
    {
      fieldname: 'canCreateOrder',
      label: 'Can Create Order',
      fieldtype: 'Check',
      default: 1
    }
  ],

  quickEditFields: [
    'name',
    'fullName',
    'password',
    'phoneNumber',
    'role',
    'status',
    'canTag',
    'canRelease',
    'canCreateOrder',
    'canCreateTrip'
  ]
};
