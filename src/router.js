import Vue from 'vue';
import Router from 'vue-router';

// standard views
import Dashboard from '@/pages/Dashboard/Dashboard';
import ListView from '@/pages/ListView/ListView';
import PrintView from '@/pages/PrintView/PrintView';
import QuickEditForm from '@/pages/QuickEditForm';
import Report from '@/pages/Report';
import I3msAccount from '@/pages/I3msAccount';
import I3msReturns from '@/pages/I3msReturns';

// custom views
import GetStarted from '@/pages/GetStarted';
import ChartOfAccounts from '@/pages/ChartOfAccounts';
import InvoiceForm from '@/pages/InvoiceForm';
import JournalEntryForm from '@/pages/JournalEntryForm';
import PermitActionForm from '@/pages/PermitActionForm';
import DataImport from '@/pages/Import';
import CustomerCare from '@/pages/CustomerCare';
import Payment from './components/Payment';
import TermsAndConditions from './components/TermsAndConditions';

Vue.use(Router);

const routes = [
  {
    path: '/',
    component: Dashboard
  },
  {
    path: '/get-started',
    component: GetStarted
  },
  {
    path: '/terms-conditions',
    component: TermsAndConditions
  },
  {
    path: '/edit/JournalEntry/:name',
    name: 'JournalEntryForm',
    components: {
      default: JournalEntryForm,
      edit: QuickEditForm
    },
    props: {
      default: route => {
        // for sidebar item active state
        route.params.doctype = 'JournalEntry';
        return {
          doctype: 'JournalEntry',
          name: route.params.name
        };
      },
      edit: route => route.query
    }
  },
  {
    path: '/PermitAction/:name',
    name: 'PermitAction',
    components: {
      default: PermitActionForm,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  },
  {
    path: '/import/:doctype',
    name: 'ImportData',
    components: {
      default: DataImport,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  },
  {
    path: '/edit/:doctype/:name',
    name: 'InvoiceForm',
    components: {
      default: InvoiceForm,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  },
  {
    path: '/list/:doctype',
    name: 'ListView',
    components: {
      default: ListView,
      edit: QuickEditForm
    },
    props: {
      default: route => {
        const { doctype, filters } = route.params;
        return {
          doctype,
          filters
        };
      },
      edit: route => route.query
    }
  },
  {
    path: '/print/:doctype/:name',
    name: 'PrintView',
    component: PrintView,
    props: true
  },
  {
    path: '/i3msAccount',
    name: 'I3msAccount',
    component: I3msAccount,
    props: true
  },
  {
    path: '/i3msReturns',
    name: 'i3msReturns',
    component: I3msReturns,
    props: true
  },
  {
    path: '/report/:reportName',
    name: 'Report',
    component: Report,
    props: true
  },
  {
    path: '/chart-of-accounts',
    name: 'Chart Of Accounts',
    components: {
      default: ChartOfAccounts,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  },
  {
    path: '/customer-care',
    name: 'Customer Care',
    components: {
      default: CustomerCare,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  },
  {
    path: '/billing',
    name: 'Billing',
    components: {
      default: Payment,
      edit: QuickEditForm
    },
    props: {
      default: true,
      edit: route => route.query
    }
  }
];

let router = new Router({ routes });

if (process.env.NODE_ENV === 'development') {
  window.router = router;
}

export default router;
