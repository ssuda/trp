// Run with: node tests/testAutoTagging.js
// Regression checks for the real coordinator/API. No portal requests or jobs
// are sent; Electron, the database and browser boundaries are local fixtures.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { execFileSync } = require('child_process');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const moment = require('moment');
const Observable = require('frappejs/utils/observable');

const root = path.resolve(__dirname, '..');
const apiSource = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', 'HEAD:api/index.js'], {
      cwd: root,
      encoding: 'utf8'
    })
  : undefined;
const coordinatorSource = process.argv.includes('--baseline')
  ? execFileSync('git', ['show', 'HEAD:src/autoTagging.js'], {
      cwd: root,
      encoding: 'utf8'
    })
  : fs.readFileSync(path.join(root, 'src/autoTagging.js'), 'utf8');
const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
function load(relativePath, overrides = {}, source) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireNormal = loaded.require.bind(loaded);
  loaded.require = name =>
    Object.prototype.hasOwnProperty.call(overrides, name)
      ? overrides[name]
      : requireNormal(name);
  loaded._compile(
    transformSync(source || fs.readFileSync(filename, 'utf8'), {
      configFile: false,
      babelrc: false,
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }).code,
    filename
  );
  return loaded.exports;
}

const permit = (name, source = 'Mine', extra = {}) => ({
  name,
  source,
  transportedFrom: 'Pit A',
  startDate: moment().format('YYYY-MM-DD'),
  taggingUrl:
    'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx?fixture',
  tagged: {},
  ...extra
});
const rule = (name = 'rule', extra = {}) => ({
  name,
  source: 'Mine',
  truckList: 'trucks',
  priority: '1',
  ...extra
});

function fixture(stored = [rule()], source = coordinatorSource) {
  const ipcHandlers = new Map();
  const events = new Observable();
  const saved = new Map();
  const truckLists = new Map([['trucks', { trucks: 'OD14TEST1\nOD14TEST2' }]]);
  const actions = [];
  const routes = [];
  const sent = [];
  const logs = [];
  const state = {
    stored,
    saving: null,
    navigate: null,
    send: null,
    dbError: null
  };
  const intervals = [];
  const timers = {
    setInterval: (callback, ms) => {
      const timer = { callback, ms, active: true };
      intervals.push(timer);
      return timer;
    },
    clearInterval: timer => {
      timer.active = false;
    }
  };
  const frappe = {
    events,
    isTagging: false,
    _: text => text,
    AccountingSettings: {
      i3msUsername: 'fixture',
      i3msPassword: 'fixture',
      showBrowser: 0,
      numBrowsers: 10
    },
    db: {
      getAll: async () => {
        if (state.dbError) throw state.dbError;
        return state.stored;
      }
    },
    getDoc: async (doctype, name) => {
      const doc =
        doctype === 'PermitAction'
          ? actions.find(action => action.name === name)
          : (doctype === 'Permit' ? saved : truckLists).get(name);
      if (!doc) throw new Error(`Missing fixture ${doctype} ${name}`);
      return doc;
    },
    getNewDoc: () => {
      const action = {
        name: `action-${actions.length + 1}`,
        set: async values => Object.assign(action, values)
      };
      actions.push(action);
      return action;
    }
  };
  const ipcRenderer = {
    on: (event, handler) => {
      const handlers = ipcHandlers.get(event) || [];
      handlers.push(handler);
      ipcHandlers.set(event, handlers);
    },
    send: (event, args) => {
      sent.push({ event, args });
      if (state.send) state.send(event, args);
    }
  };
  const router = {
    push: async route => {
      if (state.navigate) await state.navigate(route);
      routes.push(route);
    }
  };
  const savePermit = async data => {
    if (state.saving) await state.saving(data);
    const isNew = !saved.has(data.name);
    const old = saved.get(data.name) || {};
    const tagged = {
      ...(old.tagged ? JSON.parse(old.tagged) : {}),
      ...data.tagged
    };
    saved.set(data.name, { ...old, ...data, tagged: JSON.stringify(tagged) });
    return isNew;
  };
  const stop = load(
    'src/autoTagging.js',
    {
      'fixture-timers': timers,
      'fixture-console': {
        log: (...args) => logs.push(args),
        error: (...args) => console.error(...args)
      }
    },
    `const { setInterval, clearInterval } = require('fixture-timers');\nconst console = require('fixture-console');\n${source}`
  ).setupAutoTagging({
    frappe,
    ipcRenderer,
    router,
    savePermit
  });
  const poll = async rows => {
    for (const handler of ipcHandlers.get('new-permits'))
      await handler({}, rows);
  };
  const finish = async (complete = true) => {
    const action = actions[actions.length - 1];
    const permitName =
      typeof action.permit === 'string' ? action.permit : action.permit.name;
    frappe.isTagging = true;
    await events.trigger('tag-vehicles', { name: permitName });
    if (complete)
      saved.get(permitName).tagged = JSON.stringify({
        OD14TEST1: '',
        OD14TEST2: ''
      });
    await events.trigger(
      'tag-results',
      complete ? { OD14TEST1: '', OD14TEST2: '' } : {}
    );
    frappe.isTagging = false;
  };
  return {
    frappe,
    events,
    saved,
    truckLists,
    actions,
    routes,
    sent,
    logs,
    state,
    ipcHandlers,
    intervals,
    stop,
    tickMonitor: async () => {
      for (const timer of intervals) if (timer.active) await timer.callback();
      await flush();
    },
    failMonitor: async failure => {
      for (const handler of ipcHandlers.get('i3ms-operation-failed') || []) {
        await handler({}, failure);
      }
    },
    poll,
    finish
  };
}

async function legacyParityTests() {
  const legacy = execFileSync('git', ['show', '4812d32:src/main.js'], {
    cwd: root,
    encoding: 'utf8'
  });
  let registration;
  function find(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.name === 'on' &&
      node.arguments[0] &&
      node.arguments[0].value === 'auto-tagging'
    )
      registration = legacy.slice(node.start, node.end);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(find);
      else if (value && typeof value === 'object') find(value);
    }
  }
  find(parse(legacy, { sourceType: 'module' }));
  assert(registration, 'locate the actual 1.1.15 registration');
  const legacyModule = `import moment from 'moment';
  export function setupAutoTagging({ frappe, ipcRenderer, router, savePermit }) {
    const _ = frappe._;
    ${registration};
    return () => {};
  }`;
  const stored = [
    rule('first', { transportedFrom: 'Pit A', priority: '1' }),
    rule('second', { source: 'Mine B', priority: '2' })
  ];
  const legacyFixture = fixture(
    JSON.parse(JSON.stringify(stored)),
    legacyModule
  );
  const restored = fixture(stored);
  try {
    for (const f of [legacyFixture, restored]) {
      await f.events.trigger('auto-tagging');
      await f.poll([
        permit('WRONG-LOCATION', 'Mine', { transportedFrom: 'Pit B' }),
        permit('FIRST'),
        permit('SECOND', 'Mine B')
      ]);
      await f.poll([permit('FIRST'), permit('SECOND', 'Mine B')]);
    }
    const actions = f =>
      f.actions.map(({ permit, truckList, isCloudTagging }) => ({
        permit,
        truckList,
        isCloudTagging
      }));
    assert.deepEqual(actions(restored), actions(legacyFixture));
    assert.deepEqual(
      [...restored.saved.keys()],
      [...legacyFixture.saved.keys()]
    );
    assert.equal(restored.actions.length, 1);
    console.log(
      'PASS: selected action and save/new-permit eligibility match the actual 1.1.15 callback'
    );
  } finally {
    legacyFixture.stop();
    restored.stop();
  }
}

async function coordinatorTests() {
  const f = fixture([rule('location', { transportedFrom: 'Pit A' })]);
  try {
    assert.equal(
      f.sent.length,
      0,
      'restore event-driven startup without a heartbeat'
    );
    await f.events.trigger('auto-tagging');
    assert.equal(
      f.intervals.length,
      0,
      'the newer monitor/dispatch heartbeat is removed'
    );
    assert.deepEqual(f.sent[0].args, {
      credentials: { username: 'fixture', password: 'fixture' },
      showBrowser: false
    });
    await f.poll([
      permit('OLD', 'Mine', {
        startDate: moment()
          .subtract(1, 'day')
          .format('YYYY-MM-DD')
      }),
      permit('OTHER-SOURCE', 'Other mine'),
      permit('OTHER-LOCATION', 'Mine', { transportedFrom: 'Pit B' }),
      permit('MISSING-LOCATION', 'Mine', { transportedFrom: undefined }),
      permit('NEW')
    ]);
    assert.equal(f.actions[0].permit, 'NEW');
    assert.equal(f.actions[0].truckList, 'trucks');
    assert.equal(f.actions[0].isCloudTagging, true);
    assert.equal(f.saved.has('OLD'), false);
    assert.equal(
      f.saved.has('OTHER-SOURCE'),
      true,
      'save all current-day permits before matching, as in 1.1.15'
    );
    assert.equal(f.saved.has('OTHER-LOCATION'), true);
    assert.equal(f.saved.has('MISSING-LOCATION'), true);
    assert(f.logs.some(args => args[0] === 'Received new permits'));
    assert(
      f.logs.some(
        args =>
          args[0] === 'Matched new Permit with Auto Tagging' && args[1] === 1
      )
    );
    await f.poll([permit('NEW')]);
    assert.equal(
      f.routes.length,
      1,
      'existing local permits are not dispatched again'
    );
    f.frappe.isTagging = true;
    await f.poll([permit('WHILE-BUSY')]);
    assert.equal(
      f.saved.has('WHILE-BUSY'),
      false,
      'do not process a batch while tagging'
    );
    f.frappe.isTagging = false;
    await f.poll([permit('WHILE-BUSY')]);
    assert.equal(f.actions[1].permit, 'WHILE-BUSY');
    console.log(
      'PASS: 1.1.15 today-only, save-first, new-only, source/location matching and normal automatic action'
    );
  } finally {
    f.stop();
  }

  const priority = fixture([
    rule('second', { source: 'Mine B', priority: '2' }),
    rule('first', { priority: '1' })
  ]);
  try {
    await priority.events.trigger('auto-tagging');
    await priority.poll([permit('B', 'Mine B'), permit('A')]);
    assert.equal(priority.actions[0].permit, 'A');
    await priority.poll([permit('B', 'Mine B'), permit('A')]);
    assert.equal(
      priority.routes.length,
      1,
      'restore new-in-database eligibility, not a pending work queue'
    );
    await priority.events.trigger('auto-tagging', [
      rule('first', { source: 'Updated mine' })
    ]);
    assert.equal(
      priority.ipcHandlers.get('new-permits').length,
      1,
      'rule edits keep one IPC listener'
    );
    await priority.poll([permit('UPDATED', 'Updated mine')]);
    assert.equal(priority.actions[1].permit, 'UPDATED');
    console.log(
      'PASS: legacy priority/eligibility and rule updates without duplicate listeners'
    );
  } finally {
    priority.stop();
  }

  const race = fixture();
  try {
    await race.events.trigger('auto-tagging');
    race.state.saving = async () => {
      race.frappe.isTagging = true;
    };
    await race.poll([permit('MANUAL-RACE')]);
    assert.equal(
      race.routes.length,
      0,
      'do not open an automatic action over a manual tagging job'
    );
    console.log('PASS: manual-job guard remains intact');
  } finally {
    race.stop();
  }
}

async function apiTests() {
  let destroyed = false;
  let initializes = 0;
  let closes = 0;
  let details = 0;
  let reads = 0;
  let connected = true;
  let failStartup = false;
  const waits = [];
  const batches = [];
  const monitor = {
    initializeBrowser: async () => {
      initializes++;
      if (failStartup) throw new Error('Fixture startup failed');
      connected = true;
    },
    getBrowser: () => connected,
    lastTwoMonthPermits: async (
      href,
      selector,
      previousMonth,
      onlyNewPermits
    ) => {
      reads++;
      assert.equal(selector, '#grdTransporterActions');
      assert.equal(previousMonth, false);
      assert.equal(onlyNewPermits, true);
      return [
        {
          'Permit No.': 'DETAIL-PERMIT',
          'Request On': moment().format('DD MMM YYYY'),
          'Lessee/Licensee Name': 'Different list identity-123',
          'Tag New Vehicle':
            'https://i3ms.odishaminerals.gov.in/i3ms/pms/TransporterAssignVehicleNew.aspx?fixture'
        }
      ];
    },
    permitDetails: async href => {
      details++;
      assert(href.includes('/VehicleDetails.aspx?fixture'));
      return {
        'Requested By': 'Mine',
        'Transported From': 'PIT A',
        'Permit Qty.': '100',
        'Permit Validity': moment()
          .add(1, 'month')
          .format('DD MMM YYYY')
      };
    },
    permitVehicles: () => {
      throw new Error('No trip reports during auto discovery');
    },
    releasePage: () => {
      throw new Error('No release-page scan during auto discovery');
    },
    disconnect: async () => {
      connected = false;
      closes++;
    }
  };
  const api = load(
    'api/index.js',
    {
      './browser': () => monitor,
      './utils': {
        delay: async ms => waits.push(ms),
        promiseWithTimeout: promise => promise
      },
      'console-stamp': () => {}
    },
    apiSource
  );
  const sender = {
    isDestroyed: () => destroyed,
    send: (event, batch) => {
      assert.equal(event, 'new-permits');
      batches.push(batch);
      if (batches.length === 2) destroyed = true;
    }
  };
  await api.newPermits(
    { username: 'fixture', password: 'fixture' },
    false,
    sender
  );
  assert.equal(reads, 2);
  assert.equal(details, 2);
  assert.deepEqual(waits, [5000]);
  assert.equal(initializes, 1);
  assert.equal(closes, 1);
  for (const batch of batches) {
    assert.equal(
      batch[0].source,
      'Mine',
      'use Requested By from details as in 1.1.15'
    );
    assert.equal(
      batch[0].transportedFrom,
      'PIT A',
      'extract the field missing from the list'
    );
    assert.equal(batch[0].quantity, 100);
    assert.deepEqual(batch[0].tagged, {});
    assert.deepEqual(batch[0].trips, []);
  }

  const coordinator = fixture([rule('location', { transportedFrom: 'Pit A' })]);
  try {
    await coordinator.events.trigger('auto-tagging');
    await coordinator.poll(batches[0]);
    assert.equal(coordinator.actions[0].permit, 'DETAIL-PERMIT');
    assert.equal(
      coordinator.saved.get('DETAIL-PERMIT').transportedFrom,
      'PIT A'
    );
  } finally {
    coordinator.stop();
  }
  console.log(
    'PASS: legacy monitor reads actual details, extracts source/location and waits five seconds between polls without trip/release scans'
  );

  failStartup = true;
  await assert.rejects(
    api.newPermits({}, false, sender),
    /Fixture startup failed/
  );
  failStartup = false;
  await api.newPermits({}, false, sender);
  assert.equal(
    initializes,
    3,
    'failed or stopped monitors release their singleton'
  );
  assert.equal(closes, 3);
  console.log(
    'PASS: monitor cleanup remains intact on shutdown and failed initialization'
  );
}

async function formTests(detectedPermit = permit('FORM'), storedRules) {
  const f = fixture(storedRules);
  const jobs = [];
  f.events.on('tag-vehicles', job => jobs.push(job));
  await f.events.trigger('auto-tagging');
  await f.poll([detectedPermit]);
  const source = fs.readFileSync(
    path.join(root, 'src/pages/PermitActionForm.vue'),
    'utf8'
  );
  const script = source.split('<script>')[1].split('</script>')[0];
  let online = true;
  const component = load(
    'src/pages/PermitActionForm.vue',
    {
      frappejs: f.frappe,
      '@/components/PageHeader': {},
      '@/components/Button': {},
      '@/components/Controls/FormControl': {},
      '@/components/BackLink': {},
      '@/sqsSend': {},
      '@/firebase': {},
      'is-online': async () => online,
      '@/utils': {
        showMessageDialog: async () => {},
        handleErrorWithDialog: error => {
          throw error;
        }
      },
      '@/permit': {}
    },
    script
  ).default;
  const makeForm = () => ({
    ...component.data(),
    name: f.actions[f.actions.length - 1].name,
    _: value => value,
    $router: { back: () => {}, replace: () => {} },
    onClick: component.methods.onClick,
    handleError: component.methods.handleError,
    success: 2
  });
  const context = makeForm();
  try {
    await component.created.call(context);
    assert.equal(
      f.frappe.isTagging,
      true,
      'automatic form reaches the normal tag-vehicles dispatch'
    );
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].name, detectedPermit.name);
    assert.equal(jobs[0].taggingUrl, detectedPermit.taggingUrl);
    assert.deepEqual(jobs[0].trucks, ['OD14TEST1', 'OD14TEST2']);
    await f.poll([]);
    assert.equal(
      f.routes.length,
      1,
      'startup notification does not release a running job'
    );
    await f.finish();
    assert.equal(
      context.loading,
      false,
      'normal completion clears the form timer and lock'
    );
    await f.poll([]);
    assert.equal(f.routes.length, 1);

    console.log(
      'PASS: complete permit details open the normal automatic form and dispatch the correct trucks'
    );
  } finally {
    // The real form owns an interval; release it even if an assertion fails.
    await f.events.trigger('tag-results', {});
    f.frappe.isTagging = false;
    f.stop();
  }
}

async function saveTests() {
  // Exercise the actual main.js closure without starting Vue or Electron.
  const source = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const ast = parse(source, { sourceType: 'module' });
  const iife = ast.program.body.find(
    node =>
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression'
  );
  const declaration = iife.expression.callee.body.body.find(
    node => node.type === 'FunctionDeclaration' && node.id.name === 'savePermit'
  );
  const stored = {
    name: 'SAVE',
    tagged: '{"OD14TEST1":""}',
    delivered: 42,
    numTrips: 3
  };
  const frappe = {
    getDoc: async () => stored,
    syncDoc: async update => Object.assign(stored, update)
  };
  const { savePermit } = load(
    'src/main.js',
    { frappejs: frappe },
    `const frappe = require('frappejs');
     const _ = require('lodash');
     ${source.slice(declaration.start, declaration.end)}
     module.exports = { savePermit };`
  );
  assert.equal(await savePermit(permit('SAVE')), false);
  assert.equal(
    stored.delivered,
    42,
    'monitor metadata must preserve trip totals'
  );
  assert.equal(stored.numTrips, 3);
  assert.equal(
    JSON.parse(stored.tagged).OD14TEST1,
    '',
    'monitor metadata preserves tagging progress'
  );
  console.log(
    'PASS: repeated monitor saves preserve trip totals and tagged vehicles'
  );
}

module.exports = { formTests };

if (require.main === module) {
  (async () => {
    await legacyParityTests();
    await coordinatorTests();
    await formTests();
    await saveTests();
    await apiTests();
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
