// Run with: node tests/testAutoTagging.js
// Regression checks for the real coordinator/API. No portal requests or jobs
// are sent; Electron, the database and browser boundaries are local fixtures.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const moment = require('moment');
const Observable = require('frappejs/utils/observable');

const root = path.resolve(__dirname, '..');
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

function fixture(stored = [rule()]) {
  const ipcHandlers = new Map();
  const events = new Observable();
  const saved = new Map();
  const truckLists = new Map([['trucks', { trucks: 'OD14TEST1\nOD14TEST2' }]]);
  const actions = [];
  const routes = [];
  const sent = [];
  const state = { stored, saving: null, navigate: null };
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
    db: { getAll: async () => state.stored },
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
    send: (event, args) => sent.push({ event, args })
  };
  const router = {
    push: async route => {
      if (state.navigate) await state.navigate(route);
      routes.push(route);
    }
  };
  const savePermit = async data => {
    if (state.saving) await state.saving(data);
    const old = saved.get(data.name) || {};
    const tagged = {
      ...(old.tagged ? JSON.parse(old.tagged) : {}),
      ...data.tagged
    };
    saved.set(data.name, { ...old, ...data, tagged: JSON.stringify(tagged) });
    // Return false: existing local permits must still be eligible.
    return false;
  };
  load('src/autoTagging.js').setupAutoTagging({
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
    state,
    ipcHandlers,
    poll,
    finish
  };
}

async function coordinatorTests() {
  const f = fixture();
  await f.events.trigger('auto-tagging');
  await f.events.trigger('auto-tagging', [rule('rule', { priority: '2' })]);
  assert.equal(
    f.ipcHandlers.get('new-permits').length,
    1,
    'setup installs only one listener'
  );
  assert.equal(f.sent[0].args.showBrowser, false);
  await Promise.all([
    f.poll([permit('P2'), permit('P1')]),
    f.poll([permit('P1')])
  ]);
  assert.equal(
    f.routes.length,
    1,
    'overlapping polls and form startup reserve one job'
  );
  assert.equal(f.actions[0].permit, 'P1');
  assert.equal(f.actions[0].numBrowsers, 10);
  await f.poll([permit('P2')]);
  assert.equal(
    f.routes.length,
    1,
    'do not navigate while the auto form is starting'
  );
  await f.finish();
  await f.poll([]);
  assert.equal(
    f.actions[1].permit,
    'P2',
    'second detected permit is retained after first completes'
  );
  await f.finish();
  await f.poll([permit('P1'), permit('P2')]);
  assert.equal(f.routes.length, 2, 'completed jobs do not launch again');
  console.log(
    'PASS: single listener, duplicate polls, startup reservation and retained global permit queue'
  );

  const busy = fixture();
  await busy.events.trigger('auto-tagging');
  busy.frappe.isTagging = true;
  await busy.poll([permit('BUSY')]);
  assert.equal(busy.routes.length, 0);
  busy.frappe.isTagging = false;
  await busy.poll([]);
  assert.equal(
    busy.routes.length,
    1,
    'permits detected during manual tagging remain queued'
  );
  const racing = fixture();
  await racing.events.trigger('auto-tagging');
  racing.state.saving = async () => {
    racing.frappe.isTagging = true;
  };
  await racing.poll([permit('RACE')]);
  assert.equal(
    racing.routes.length,
    0,
    'recheck the busy flag after async preparation'
  );
  racing.state.saving = null;
  racing.frappe.isTagging = false;
  await racing.poll([]);
  assert.equal(racing.routes.length, 1);
  console.log(
    'PASS: manual tagging and preparation races keep automatic work pending'
  );

  const priority = fixture([
    rule('slow', { source: 'Mine B', priority: '10' }),
    rule('fast', { priority: '2', transportedFrom: ' Pit A ' })
  ]);
  await priority.events.trigger('auto-tagging');
  await priority.poll([
    permit('WRONG-LOCATION', 'Mine', { transportedFrom: 'Pit B' }),
    permit('OLD', 'Mine', {
      startDate: moment()
        .subtract(1, 'day')
        .format('YYYY-MM-DD')
    }),
    permit('P10', 'Mine B'),
    permit('P2', ' mine ')
  ]);
  assert.equal(
    priority.actions[0].permit,
    'P2',
    'numeric priority and trimmed matching'
  );
  await priority.finish();
  await priority.poll([]);
  assert.equal(priority.actions[1].permit, 'P10');
  await priority.finish();
  await priority.poll([]);
  assert.equal(
    priority.routes.length,
    2,
    'date and optional location filters are enforced'
  );
  console.log(
    'PASS: numeric priority, date filter and optional transported-from matching'
  );

  const failed = fixture();
  await failed.events.trigger('auto-tagging');
  failed.state.navigate = async () => {
    throw new Error('Fixture navigation failed');
  };
  await failed.poll([permit('RETRY')]);
  failed.state.navigate = null;
  await failed.poll([]);
  assert.equal(
    failed.routes.length,
    1,
    'failed navigation retries an already-saved permit'
  );
  await failed.events.trigger('auto-tagging-attempted', failed.actions[1].name);
  await failed.poll([]);
  assert.equal(
    failed.routes.length,
    2,
    'early form return releases the startup reservation'
  );
  await failed.finish(false);
  await failed.poll([]);
  assert.equal(
    failed.routes.length,
    3,
    'empty failure results are not treated as completed work'
  );
  console.log(
    'PASS: startup failure, early form return and empty result recovery'
  );

  const empty = fixture();
  empty.truckLists.set('trucks', { trucks: '' });
  await empty.events.trigger('auto-tagging');
  await empty.poll([permit('EMPTY')]);
  assert.equal(empty.routes.length, 0);
  empty.truckLists.set('trucks', { trucks: 'OD14TEST1' });
  await empty.poll([]);
  assert.equal(
    empty.routes.length,
    1,
    'an empty truck list is not permanently completed'
  );
  console.log('PASS: missing trucks can be supplied and retried');

  const updated = fixture();
  await updated.events.trigger('auto-tagging');
  await updated.events.trigger('auto-tagging', [
    rule('rule', { source: 'Updated Mine' })
  ]);
  await updated.poll([permit('UPDATED', 'Updated Mine')]);
  assert.equal(
    updated.routes.length,
    1,
    'a re-saved rule replaces its stored configuration'
  );
  assert.equal(updated.ipcHandlers.get('new-permits').length, 1);
  console.log('PASS: latest rule configuration replaces stale listeners');
}

async function apiTests() {
  let factoryCount = 0;
  let failInitialization = false;
  let monitorDisconnected = 0;
  let reads = 0;
  const row = {
    'Permit No.': 'FIXTURE-PERMIT',
    'Request On': moment().format('DD MMM YYYY'),
    'Lessee/Licensee Name': 'Mine',
    'Tag New Vehicle': permit('P').taggingUrl,
    'Vehicle Details':
      'https://i3ms.odishaminerals.gov.in/i3ms/pms/VehicleDetails.aspx?fixture'
  };
  const monitor = {
    initializeBrowser: async () => {
      if (failInitialization) throw new Error('Fixture initialization failed');
    },
    disconnect: async () => {
      monitorDisconnected++;
    },
    getBrowser: () => ({}),
    lastTwoMonthPermits: async (...args) => {
      assert.equal(
        args.length,
        4,
        'permit lookup must not enter the nested SSE polling loop'
      );
      reads++;
      return [
        { 'Permit No.': 'BROKEN-ROW', 'Request On': row['Request On'] },
        row,
        { ...row, 'Permit No.': 'FROM-DETAILS', 'Tag New Vehicle': '' }
      ];
    },
    permitDetails: async () => ({
      'Permit Qty.': '100',
      'Requested By': 'Mine',
      'Transported From': 'Pit A'
    })
  };
  const api = load('api/index.js', {
    './browser': () => {
      factoryCount++;
      return monitor;
    },
    './utils': {
      delay: async () => {},
      promiseWithTimeout: async promise => promise
    },
    'console-stamp': () => {}
  });
  let destroyed = false;
  const out = [];
  const sender = {
    isDestroyed: () => destroyed,
    send: (event, data) => {
      out.push({ event, data });
      destroyed = true;
    }
  };
  await api.newPermits({}, false, sender);
  assert.equal(
    out[0].data[0].name,
    'FIXTURE-PERMIT',
    'active taggable rows must not be discarded'
  );
  assert.equal(out[0].data[0].transportedFrom, 'Pit A');
  assert.equal(
    out[0].data.length,
    2,
    'a malformed row must not drop valid permits'
  );
  assert.equal(
    out[0].data[1].name,
    'FROM-DETAILS',
    'derive the tagging link when the direct link is absent'
  );
  assert.equal(reads, 1);
  assert.equal(monitorDisconnected, 1);
  destroyed = false;
  await api.newPermits({}, false, sender);
  assert.equal(out.length, 2, 'stopped monitor must be restartable');
  failInitialization = true;
  destroyed = false;
  await assert.rejects(
    api.newPermits({}, false, sender),
    /initialization failed/
  );
  failInitialization = false;
  await api.newPermits({}, false, sender);
  assert.equal(
    out.length,
    3,
    'initialization failure must release the monitor singleton'
  );
  assert.equal(factoryCount, 5);
  console.log(
    'PASS: active permit detection, finite lookup, renderer shutdown and monitor restart'
  );
}

async function formTests() {
  const f = fixture();
  await f.events.trigger('auto-tagging');
  await f.poll([permit('FORM')]);
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

    await f.poll([permit('OFFLINE')]);
    online = false;
    await component.created.call(makeForm());
    online = true;
    await f.poll([]);
    assert.equal(
      f.routes.length,
      3,
      'offline auto startup releases its reservation for retry'
    );
    await component.created.call(makeForm());
    await f.finish();
    console.log(
      'PASS: real automatic form starts normal tagging, finishes cleanly and retries offline startup'
    );
  } finally {
    // The real form owns an interval; release it even if an assertion fails.
    await f.events.trigger('tag-results', {});
    f.frappe.isTagging = false;
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

(async () => {
  await coordinatorTests();
  await formTests();
  await saveTests();
  await apiTests();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
