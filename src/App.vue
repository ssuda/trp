<template>
  <div
    id="app"
    class="h-screen flex flex-col font-sans overflow-hidden antialiased"
  >
    <WindowsTitleBar
      v-if="platform === 'Windows'"
      @close="reloadMainWindowOnSettingsClose"
    />
    <Desk class="flex-1" v-if="activeScreen === 'Desk'" />
    <DatabaseSelector
      v-if="activeScreen === 'DatabaseSelector'"
      @database-connect="showSetupWizardOrDesk(true)"
    />
    <SetupWizard
      v-if="activeScreen === 'SetupWizard'"
      @setup-complete="isLogin => showSetupWizardOrDesk(true, isLogin)"
    />
    <LoginRegister
      v-if="activeScreen === 'LoginRegister'"
      @login-complete="showSetupWizardOrDesk(true, true)"
    />
    <Settings v-if="activeScreen === 'Settings'" />
    <portal-target name="popovers" multiple></portal-target>
    <notifications group="trp" position="bottom center" />
    <v-dialog />
  </div>
</template>

<script>
import './styles/index.css';
import 'frappe-charts/dist/frappe-charts.min.css';
import frappe from 'frappejs';
import { firebaseAuth } from '@/firebase';
import Users from '@/users';
import Desk from './pages/Desk';
import SetupWizard from './pages/SetupWizard/SetupWizard';
import DatabaseSelector from './pages/DatabaseSelector';
import Settings from '@/pages/Settings/Settings.vue';
import WindowsTitleBar from '@/components/WindowsTitleBar';
import LoginRegister from './pages/SetupWizard/LoginRegister';
import Vue from 'vue';
import { remote } from 'electron';
import {
  connectToLocalDatabase,
  onlyConnectToRemoteDatabase,
  connectToRemoteDatabase,
  showMessageDialog
} from '@/utils';
import { getMainWindowSize } from '@/screenSize';
import config from '@/config';
import { DateTime } from 'luxon';
import { firestore } from '@/firebase';

export default {
  name: 'App',
  data() {
    return {
      activeScreen: null
    };
  },
  watch: {
    activeScreen(value) {
      if (!value) return;
      let { width, height } = getMainWindowSize();
      let size = {
        Desk: [width, height],
        DatabaseSelector: [600, 600],
        SetupWizard: [600, 750],
        Settings: [460, 577],
        LoginRegister: [600, 600]
      }[value];
      let resizable = value === 'Desk';

      let win = remote.getCurrentWindow();
      if (size.length) {
        win.setSize(...size);
        win.setResizable(resizable);
      }
    }
  },
  components: {
    Desk,
    SetupWizard,
    DatabaseSelector,
    Settings,
    WindowsTitleBar,
    LoginRegister
  },
  async mounted() {
    Vue.modal = this.$modal;
    let user;
    try {
      user = await Users.getCurrentUser();
    } catch (ex) {
      console.error(ex);
    }

    console.log(user);

    if (user && user.displayName) {
      console.log('connecting db', user.displayName);
      try {
        if (process.env.NODE_ENV === 'development') {
          await connectToRemoteDatabase();
        } else {
          await onlyConnectToRemoteDatabase();
        }
        console.log('connected db', user.displayName);
        this.showSetupWizardOrDesk();
      } catch (ex) {
        console.error(ex);
        console.log('failed to connect to db', user.displayName);
        if (/(password)/i.test(ex.message)) {
          await connectToLocalDatabase('./spin-trp.db');
          await user.updateProfile({ displayName: '' });
          this.activeScreen = 'SetupWizard';
        }
      }
    } else {
      const setupComplete = config.get('setupComplete', false);
      await connectToLocalDatabase('./spin-trp.db');
      this.showSetupWizardOrDesk(false, false);
    }
  },
  methods: {
    async showSetupWizardOrDesk(resetRoute = false, isLogin) {
      const { setupComplete } = frappe.AccountingSettings || {};
      if (!setupComplete && !isLogin) {
        this.activeScreen = 'SetupWizard';
      } else if (this.$route.path.startsWith('/settings')) {
        this.activeScreen = 'Settings';
      } else {
        //check whether he is logged in or not
        if (frappe.currentUser) {
          try {
            let user = frappe.currentUser;
            if (user.local && user.local.status != 'Active') {
              return showMessageDialog({
                description:
                  'Your account is disabled, please contact your administrator'
              });
            }
            const accountingSettings = frappe.AccountingSettings;
            let doc;

            try {
              doc = await firestore
                .collection('customers')
                .doc(accountingSettings.gstin)
                .get();
            } catch (ex) {
              console.log('Error getting document:', ex);
            }

            if (doc && doc.exists) {
              const trailPeriod = DateTime.fromJSDate(
                doc.trialExpiresOn.toDate()
              );
              const trailDuration = trailPeriod.diffNow('days').days;
              if (trailDuration == 0) {
                showMessageDialog({
                  description: 'Your billing started',
                  buttons: [{ label: 'Ok' }]
                });
              } else if (trailDuration > 2) {
                showMessageDialog({
                  description: `Your trail expires in ${trailDuration} day(s)`,
                  buttons: [{ label: 'Ok' }]
                });
              } else if (trailDuration < 0) {
                const billingEnd = DateTime.fromJSDate(
                  doc.billingPeriodEnd.toDate()
                );
                const duration = -billingEnd.diffNow('days').days;
                if (duration > doc.billingGracePeriod) {
                  //disable services
                  return showMessageDialog({
                    description:
                      'Your payment is pending, please pay immediately to enable the service'
                  });
                } else if (duration >= 0) {
                  //warn users for payment
                  return showMessageDialog({
                    description: `Your payment is pending, your service will be disabled in ${doc.billingGracePeriod -
                      duration} days, please pay now to avoid disprution to your serivce`
                  });
                } else if (duration >= -2) {
                  //give info to the user
                  return showMessageDialog({
                    description: `Your billing period ends in ${-duration} day(s)`
                  });
                }
              }
            }
          } catch (ex) {
            console.error(ex);
          }
          this.activeScreen = 'Desk';
        } else {
          this.activeScreen = 'LoginRegister';
        }
        this.checkForUpdates();
      }
      if (resetRoute) {
        this.$router.replace('/');
      }
    },
    reloadMainWindowOnSettingsClose() {
      if (this.activeScreen === 'Settings') {
        frappe.events.trigger('reload-main-window');
      }
    },
    checkForUpdates() {
      frappe.events.trigger('check-for-updates');
    }
  }
};
</script>
