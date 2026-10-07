import moment from 'moment';

const normalize = value =>
  String(value || '')
    .trim()
    .toUpperCase();
const isToday = permit =>
  permit &&
  permit.name &&
  moment(permit.startDate, 'YYYY-MM-DD', true).isSame(moment(), 'day');

// Detection and navigation are separate from the existing tagging procedure.
// Keep permits pending until their job actually starts and completes, rather
// than using "new in the local database" as a one-shot dispatch flag.
export function setupAutoTagging({ frappe, ipcRenderer, router, savePermit }) {
  let rules = [];
  let configuring = Promise.resolve();
  let dispatching = false;
  let active = null;
  const pending = new Map();
  const completed = new Set();

  const matches = (rule, permit) =>
    normalize(rule.source) &&
    normalize(rule.source) === normalize(permit.source) &&
    (!normalize(rule.transportedFrom) ||
      normalize(rule.transportedFrom) === normalize(permit.transportedFrom));

  async function dispatch() {
    if (dispatching || active || frappe.isTagging || !rules.length) return;
    dispatching = true;
    try {
      const candidates = [];
      for (const permit of pending.values()) {
        if (!isToday(permit)) {
          pending.delete(permit.name);
          continue;
        }
        const rule = rules
          .filter(rule => matches(rule, permit))
          .sort((a, b) => (+a.priority || 10) - (+b.priority || 10))[0];
        if (rule) candidates.push({ rule, permit });
      }
      candidates.sort(
        (a, b) =>
          (+a.rule.priority || 10) - (+b.rule.priority || 10) ||
          a.permit.name.localeCompare(b.permit.name)
      );

      for (const { rule, permit } of candidates) {
        try {
          await savePermit(permit);
          const saved = await frappe.getDoc('Permit', permit.name);
          const truckList = await frappe.getDoc('TruckList', rule.truckList);
          const trucks = String(truckList.trucks || '')
            .split('\n')
            .filter(Boolean);
          const tagged = saved.tagged ? JSON.parse(saved.tagged) : {};
          if (!trucks.length) continue;
          if (trucks.every(truck => truck in tagged)) {
            pending.delete(permit.name);
            completed.add(permit.name);
            continue;
          }

          // Manual tagging may have started during the database reads.
          if (frappe.isTagging) return;
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
          if (frappe.isTagging) return;

          // Reserve through automatic form startup, before isTagging is set.
          active = {
            permit: permit.name,
            action: action.name,
            started: false
          };
          await router.push({
            name: 'PermitAction',
            params: { name: action.name }
          });
          return;
        } catch (ex) {
          if (active && active.permit === permit.name && !active.started) {
            active = null;
          }
          console.error('Auto tagging could not start:', permit.name, ex);
          // Keep this permit pending for the next monitor result.
        }
      }
    } finally {
      dispatching = false;
    }
  }

  // Installed once, before starting the monitor. Re-saving a rule updates the
  // configuration instead of accumulating IPC listeners with stale rules.
  ipcRenderer.on('new-permits', async (event, permits) => {
    for (const permit of Array.isArray(permits) ? permits : []) {
      if (isToday(permit) && !completed.has(permit.name)) {
        pending.set(permit.name, permit);
      }
    }
    await dispatch();
  });

  frappe.events.on('tag-vehicles', args => {
    if (active && args && args.name === active.permit) active.started = true;
  });
  frappe.events.on('tag-results', () => {
    if (active && active.started) {
      // The main process can return an empty result on startup failure. Keep
      // the permit until the next dispatch checks the saved truck results.
      active = null;
    }
  });
  frappe.events.on('auto-tagging-attempted', actionName => {
    if (active && active.action === actionName && !active.started) {
      active = null;
    }
  });

  frappe.events.on('auto-tagging', docs => {
    configuring = configuring
      .catch(() => {})
      .then(async () => {
        const stored = await frappe.db.getAll({
          doctype: 'AutoTagging',
          fields: ['*']
        });
        const byName = new Map(stored.map(rule => [rule.name, rule]));
        for (const rule of docs || []) byName.set(rule.name, rule);
        rules = [...byName.values()];
        if (rules.length) {
          ipcRenderer.send('auto-tagging', {
            credentials: {
              username: frappe.AccountingSettings.i3msUsername,
              password: frappe.AccountingSettings.i3msPassword
            },
            showBrowser: !!frappe.AccountingSettings.showBrowser
          });
          await dispatch();
        }
      })
      .catch(ex => {
        console.error('Auto tagging configuration failed:', ex);
      });
    return configuring;
  });
}
