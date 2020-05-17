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
      action: async function(router) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          doc.set({
            label: _('Fetch Permits From I3MS'),
            action: 'fetchNew'
          });

          router.push({
            name: 'PermitAction',
            params: {
              name: doc.name,
            }
          });
        } catch (ex) {
          console.error(ex);
        }
      }
    }
  ]
};
