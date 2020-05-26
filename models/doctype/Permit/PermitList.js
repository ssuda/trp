import { _ } from 'frappejs/utils';
import frappe from 'frappejs';

export default {
  doctype: 'Permit',
  title: _('Orders'),
  columns: [
    'type',
    'name',
    'customer',
    'startDate',
    'quantity',
    'numTagged',
    'numTrips',
    'delivered'
  ],
  orderBy: 'startDate',
  actions: [
    {
      label: 'Fetch from i3ms',
      action: async function(router) {
        try {
          const doc = await frappe.getNewDoc('PermitAction');
          doc.set({
            label: _('Fetch Permits From I3MS'),
            buttonText: _('Fetching'),
            action: 'fetchNew'
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
    }
  ]
};
