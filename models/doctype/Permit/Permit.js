const frappe = require('frappejs');
const router = require('@/router').default;
const { _ } = require('frappejs/utils');
const { exportData } = require('@/utils');

module.exports = {
  name: 'Permit',
  doctype: 'DocType',
  label: _('Permit'),
  documentClass: require('./PermitDocument'),
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  keywordFields: ['name', 'startDate', 'customer', 'quantity'],
  showTitle: false,
  fields: [
    {
      label: 'Order Type',
      fieldname: 'type',
      fieldtype: 'Select',
      options: ['I3MS', 'Non I3MS'],
      default: 'I3MS',
      required: 1
    },
    {
      label: 'Order Number',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    },
    {
      fieldname: 'startDate',
      label: 'Start Date',
      fieldtype: 'Date',
      hidden: doc => doc.type == 'I3MS'
    },
    {
      fieldname: 'endDate',
      label: 'Expiry Date',
      fieldtype: 'Date',
      hidden: doc => doc.type == 'I3MS'
    },
    {
      fieldname: 'taggingUrl',
      label: 'Tagging Link',
      fieldtype: 'Data',
      hidden: doc => doc.type != 'I3MS'
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
      hidden: doc => doc.type !== 'I3MS'
    },
    {
      fieldname: 'quantity',
      label: 'Quantity',
      fieldtype: 'Float',
      hidden: doc => doc.type == 'I3MS'
    },
    {
      fieldname: 'source',
      label: 'Source',
      fieldtype: 'Data'
    },
    {
      fieldname: 'destination',
      label: 'Destination',
      fieldtype: 'Data'
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
      fieldtype: 'Int',
      formulaDependsOn: ['tagged'],
      formula: doc => doc.getNumberOfTagged(),
      readOnly: true,
      hidden: doc => doc.type !== 'I3MS'
    },
    {
      fieldname: 'numTrips',
      label: 'Trips',
      fieldtype: 'Int',
      readOnly: true,
      formula: doc => doc.getNumberOfTrips()
    },
    {
      fieldname: 'delivered',
      label: 'Delivered',
      fieldtype: 'Float',
      readOnly: true,
      formula: doc => doc.getQuantityDelivered()
    }
  ],

  actions: [
    {
      label: 'Refresh',
      condition: doc => !doc.isNew() && doc.type === 'I3MS',
      action: async function(permit) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          doc.set({
            label: _('Refresh Permit'),
            buttonText: _('Refreshing'),
            action: 'refresh',
            permit
          });

          router.push({
            name: 'PermitAction',
            params: {
              name: doc.name
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
      condition: doc => !doc.isNew() && doc.type === 'I3MS',
      action: async function(permit) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          doc.set({
            label: _('Tagging'),
            action: 'tagging',
            buttonText: _('Tagging'),
            permit
          });

          router.push({
            name: 'PermitAction',
            params: {
              name: doc.name
            }
          });
        } catch (ex) {
          console.error(ex);
        }
      }
    },
    {
      label: 'Release',
      condition: doc => !doc.isNew() && doc.type === 'I3MS',
      action: async function(permit) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          doc.set({
            label: _('Release'),
            action: 'release',
            buttonText: _('Releasing'),
            permit
          });

          router.push({
            name: 'PermitAction',
            params: {
              name: doc.name
            }
          });
        } catch (ex) {
          console.error(ex);
        }
      }
    },
    {
      label: 'Trips',
      condition: doc => !doc.isNew(),
      action: async function(permit) {
        try {
          router.push({
            name: 'ListView',
            params: {
              doctype: 'Trip',
              filters: {
                permit: permit.name
              }
            }
          });
        } catch (ex) {
          console.error(ex);
        }
      }
    },
    {
      label: 'Tag Report',
      condition: doc => !doc.isNew() && doc.type === 'I3MS',
      action: async function(permit) {
        try {
          let tagged = JSON.parse(permit.tagged || '{}');
          tagged = Object.keys(tagged).map(t => [
            permit.name,
            t,
            tagged[t] ? 'Fail' : 'Success',
            tagged[t]
          ]);
          console.log(tagged);
          exportData(
            `${permit.name} Tag Report`,
            ['Permit', 'Truck No', 'Status', 'Reason'],
            tagged,
            true
          );
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  ],
  quickEditFields: [
    'type',
    //'account',
    'name',
    'taggingUrl',
    'startDate',
    'endDate',
    'quantity',
    'source',
    'destination',
    'customer'
  ]
};
