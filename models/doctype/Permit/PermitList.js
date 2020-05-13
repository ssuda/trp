import { _ } from 'frappejs/utils';

export default {
  doctype: 'Permit',
  title: _('Permits'),
  columns: [
    'name', 'customer', 'endDate', 'quantity'
  ],
  actions: [
    {
        label: 'Fetch',
        action: async function(doc) {
            await doc.loadLink('account');
            const account = doc.getLink('account');
            frappe.events.trigger('permits-details', { credentials: account });
        }
      }
  ],
}
