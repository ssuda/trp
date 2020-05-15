const frappe = require('frappejs');
const router = require('@/router').default;
const { _ } = require('frappejs/utils');

module.exports = {
  name: 'Permit',
  doctype: 'DocType',
  label: 'Permit',
  documentClass: require('./PermitDocument'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: ['name', 'endDate', 'customer', 'quantity'],
  //settings: 'PurchaseInvoiceSettings',
  showTitle: false,
  fields: [
    {
      label: 'Permit Number',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    },
    {
      fieldname: 'startDate',
      label: 'Start Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'endDate',
      label: 'Expiry Date',
      fieldtype: 'Date',
      default: new Date().toISOString().slice(0, 10)
    },
    {
      fieldname: 'taggingUrl',
      label: 'Tagging Link',
      fieldtype: 'Data'
    },
    {
      fieldname: 'vehicleDetails',
      label: 'Vehicle Details Link',
      fieldtype: 'Data',
      hidden: true
    },
    {
      fieldname: 'customer',
      label: 'Customer',
      fieldtype: 'Link',
      target: 'Customer'
    },
    {
      fieldname: 'account',
      label: 'I3MS Account',
      fieldtype: 'Link',
      target: 'I3MSAccount',
      required: true
    },
    {
      fieldname: 'quantity',
      label: 'Quantity',
      fieldtype: 'Float',
      required: true
    },
    {
      fieldname: 'tagged',
      label: 'Tagged',
      fieldtype: 'Text',
      hidden: true
    },
    {
      fieldname: 'numTagged',
      label: 'Tagged',
      fieldtype: 'Float',
      formulaDependsOn: ['tagged'],
      formula: doc => doc.getNumberOfTagged(),
      readOnly: true
    },
    {
      fieldname: 'numTrips',
      label: 'Trips',
      fieldtype: 'Float',
      formula: doc => doc.getNumberOfTrips(),
      readOnly: true
    },
    {
      fieldname: 'delivered',
      label: 'Delivered',
      fieldtype: 'Float',
      formula: doc => doc.getQuantityDelivered(),
      readOnly: true
    }
  ],

  actions: [
    {
      label: 'Refresh',
      condition: doc => !doc.isNew(),
      action: async function(permit) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          await doc.set({
            name: _('Refresh Permit'),
            action: 'refresh',
            permit
          });
          router.push({
            name: 'PermitAction',
            params: {
              doc: doc
            }
          });
        } catch (ex) {
          console.error(ex);
        }
        // await doc.loadLink('account');
        // const account = doc.getLink('account');
        // frappe.events.trigger('permit-details', {
        //   credentials: account,
        //   ...doc
        // });
      }
    },
    {
      label: 'Tagging',
      condition: doc => !doc.isNew(),
      action: async function(permit) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          await doc.set({
            name: _('Tagging'),
            action: 'tagging',
            permit
          });
          router.push({
            name: 'PermitAction',
            params: {
              doc: doc
            }
          });
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  ],
  quickEditFields: ['account', 'name', 'taggingUrl', 'customer']
};
