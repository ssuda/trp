//const { getActions } = require('../Transaction/Transaction');
//const InvoiceTemplate = require('../SalesInvoice/InvoiceTemplate.vue').default;
const frappe = require('frappejs');
import { _ } from 'frappejs/utils';

module.exports = {
  name: 'TruckList',
  doctype: 'DocType',
  label: 'Truck Lists',
  //documentClass: require('./TruckListDocument'),
  //printTemplate: InvoiceTemplate,
  isSingle: 0,
  isChild: 0,
  //isSubmittable: 1,
  keywordFields: ['name', 'trucks'],
  //settings: 'TruckListSettings',
  //showTitle: true,
  naming: 'name',
  fields: [
    {
      label: 'Name',
      fieldname: 'name',
      fieldtype: 'Data',
      required: 1
    },
    {
      fieldname: 'trucks',
      label: 'Trucks',
      fieldtype: 'Table',
      childtype: 'Truck',
      required: 1
    },
    // {
    //   fieldname: 'items',
    //   label: 'Items',
    //   fieldtype: 'Table',
    //   childtype: 'PurchaseInvoiceItem',
    //   required: 1
    // },
    {
      fieldname: 'numTrucks',
      label: 'No Of Trucks',
      fieldtype: 'Data',
      readOnly: 1,
      formula: doc => doc.getCount('trucks')
    }
  ],

  actions: [
    {
      label: _('New Truck'),
      condition: doc => !doc.isNew(),
      action: async (doc, router) => {
        const truck = await frappe.getNewDoc('Truck');
        doc.append('trucks', truck);
        router.push(`/edit/Truck/${truck.name}`);
      }
    }
  ]
};
