import moment from 'moment';

// Restore the 1.1.15 eligibility flow: receive complete permit details, save
// today's permits, then match only newly inserted permits and open the normal
// automatic tagging form. Do not keep the newer pending/completed queue.
export function setupAutoTagging({ frappe, ipcRenderer, router, savePermit }) {
  let rules = [];
  let processing = false;
  let stopped = false;
  const upper = value => String(value || '').toUpperCase();

  // Keep one listener across rule edits; the IPC envelope and teardown are
  // compatible with the current app, while dispatch follows 1.1.15.
  ipcRenderer.on('new-permits', async (event, permits) => {
    if (stopped || !rules.length) return;
    const today = moment();
    permits = (Array.isArray(permits) ? permits : []).filter(permit =>
      moment(permit.startDate, 'YYYY-MM-DD').isSame(today, 'day')
    );

    if (frappe.isTagging || processing) {
      console.log('Already Tagging');
      return;
    }

    processing = true;
    try {
      console.log('Received new permits', permits);
      const newPermits = [];
      for (const permit of permits) {
        if (await savePermit(permit)) {
          console.log('New permit saved', permit.name);
          newPermits.push(permit);
        }
      }

      const autoTags = rules
        .map(rule => ({
          rule,
          permit: newPermits.find(
            permit =>
              upper(permit.source) === upper(rule.source) &&
              (!rule.transportedFrom ||
                upper(rule.transportedFrom) === upper(permit.transportedFrom))
          )
        }))
        .filter(match => match.permit)
        .sort(
          (a, b) =>
            (+a.rule.priority || 10) - (+b.rule.priority || 10) ||
            a.permit.name.localeCompare(b.permit.name)
        );
      console.log('Matched new Permit with Auto Tagging', autoTags.length);

      if (!autoTags.length || frappe.isTagging || stopped) return;
      console.log('AutoTagging', autoTags);
      const { rule, permit } = autoTags[0];
      const action = frappe.getNewDoc('PermitAction');
      await action.set({
        label: frappe._('Tagging'),
        action: 'tagging',
        buttonText: frappe._('Tagging'),
        permit: permit.name,
        truckList: rule.truckList,
        numBrowsers: frappe.AccountingSettings.numBrowsers,
        isCloudTagging: true
      });
      if (frappe.isTagging || stopped) return;
      await router.push({
        name: 'PermitAction',
        params: { name: action.name }
      });
    } catch (ex) {
      console.error('Auto tagging could not start:', ex);
    } finally {
      processing = false;
    }
  });

  frappe.events.on('auto-tagging', async docs => {
    if (stopped) return;
    console.log('Setting up auto tagging');
    try {
      const stored = await frappe.db.getAll({ doctype: 'AutoTagging' });
      const byName = new Map(stored.map(rule => [rule.name, rule]));
      for (const rule of docs || []) byName.set(rule.name, rule);
      rules = [...byName.values()];
      console.log('Setting up auto tagging number of docs', rules.length);
      if (!rules.length || stopped) return;
      ipcRenderer.send('auto-tagging', {
        credentials: {
          username: frappe.AccountingSettings.i3msUsername,
          password: frappe.AccountingSettings.i3msPassword
        },
        showBrowser: !!frappe.AccountingSettings.showBrowser
      });
    } catch (ex) {
      console.error('Auto tagging configuration failed:', ex);
    }
  });

  return () => {
    stopped = true;
  };
}
