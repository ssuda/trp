import { _ } from 'frappejs/utils';
import frappe from 'frappejs';

export default {
  doctype: 'Permit',
  title: _('Permits'),
  columns: [
    'name',
    'customer',
    'endDate',
    'quantity',
    'numTagged',
    'numTrips',
    'delivered'
  ],
  actions: [
    {
      label: 'Fetch',
      action: async function(listView) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          await doc.set({
            name: _('Fetch Permits From I3MS'),
            action: 'fetchNew'
          });
          listView.$router.push({
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
  ]
};
