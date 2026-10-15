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
  let stopped = false;
  let checkingMonitor = false;
  let monitorConfig = null;
  let blockedMonitorId = null;
  const pending = new Map();
  const completed = new Set();

  const matches = (rule, permit) =>
    normalize(rule.source) &&
    normalize(rule.source) === normalize(permit.source) &&
    (!normalize(rule.transportedFrom) ||
      normalize(rule.transportedFrom) === normalize(permit.transportedFrom));

  async function dispatch() {
    if (stopped || dispatching || active || frappe.isTagging || !rules.length)
      return;
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
      console.log(
        'Matched new Permit with Auto Tagging',
        candidates.length,
        candidates.map(({ rule, permit }) => ({
          permit: permit.name,
          rule: rule.name
        }))
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
    const received = Array.isArray(permits) ? permits : [];
    console.log(
      'Received new permits',
      received.map(({ name, source, startDate, transportedFrom }) => ({
        name,
        source,
        startDate,
        transportedFrom
      }))
    );
    for (const permit of received) {
      if (isToday(permit) && !completed.has(permit.name)) {
        pending.set(permit.name, permit);
      }
    }
    console.log('Auto tagging permit queue', {
      received: received.length,
      pending: pending.size,
      rules: rules.length,
      tagging: !!frappe.isTagging,
      starting: active ? active.permit : null
    });
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

  function requestMonitor() {
    const settings = frappe.AccountingSettings || {};
    const { i3msUsername: username, i3msPassword: password } = settings;
    if (!rules.length || !username || !password || stopped) return;
    const showBrowser = !!settings.showBrowser;
    if (
      !monitorConfig ||
      monitorConfig.username !== username ||
      monitorConfig.password !== password ||
      monitorConfig.showBrowser !== showBrowser
    ) {
      monitorConfig = {
        username,
        password,
        showBrowser,
        id: (monitorConfig ? monitorConfig.id : 0) + 1
      };
    }
    if (blockedMonitorId === monitorConfig.id) return;
    // The main process reuses an active watcher. This only restarts one that
    // failed to start or stopped after its browser disconnected.
    ipcRenderer.send('auto-tagging', {
      credentials: { username, password },
      showBrowser,
      monitorId: monitorConfig.id
    });
  }

  ipcRenderer.on('i3ms-operation-failed', (event, failure) => {
    if (!failure || failure.type !== 'auto-tagging' || stopped) return;
    console.error('Auto tagging monitor failed:', failure.message);
    if (
      monitorConfig &&
      failure.monitorId === monitorConfig.id &&
      /password is incorrect/i.test(failure.message)
    ) {
      // Invalid credentials require a change, not a new browser every tick.
      blockedMonitorId = monitorConfig.id;
    }
  });

  function configure(docs) {
    if (stopped) return Promise.resolve();
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
        requestMonitor();
        await dispatch();
      })
      .catch(ex => {
        console.error('Auto tagging configuration failed:', ex);
      });
    return configuring;
  }
  frappe.events.on('auto-tagging', configure);

  // Do not depend on the one-shot App startup event or a generic internet
  // probe. Re-read saved rules and ensure the watcher exists every 10 seconds.
  const timer = setInterval(() => {
    if (checkingMonitor || stopped) return;
    checkingMonitor = true;
    return configure().finally(() => {
      checkingMonitor = false;
    });
  }, 10000);
  if (timer && typeof timer.unref === 'function') timer.unref();
  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stop, { once: true });
  }
  return stop;
}
