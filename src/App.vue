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
      @setup-complete="isLogin => showSetupWizardOrDesk(true, isLogin, true)"
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
import Users from '@/users';
import Desk from './pages/Desk';
import SetupWizard from './pages/SetupWizard/SetupWizard';
import DatabaseSelector from './pages/DatabaseSelector';
import Settings from '@/pages/Settings/Settings.vue';
import WindowsTitleBar from '@/components/WindowsTitleBar';
import LoginRegister from './pages/SetupWizard/LoginRegister';
import Vue from 'vue';
import { remote } from 'electron';
import fs from 'fs';

import {
  connectToLocalDatabase,
  showMessageDialog,
  dbPath,
  delay
} from '@/utils';
import { getMainWindowSize } from '@/screenSize';
import config from '@/config';
import { DateTime } from 'luxon';
import SetupSync from '@/sync';

import PaymentForm from './components/Payment.vue';
import TermsAndConditions from './components/TermsAndConditions.vue';
import AdvancePayment from './components/AdvancePayment.vue';

import { twoMonthsOldPermits } from '@/permit';
import isOnline from 'is-online';

const toBool = v => {
  v = v.toLowerCase();
  return v === 'true' || v === '1' || v === 'on';
};

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
        SetupWizard: [600, 650],
        Settings: [460, 577],
        LoginRegister: [600, 600]
      }[value];
      let resizable = value === 'Desk';

      let win = remote.getCurrentWindow();
      if (size.length) {
        win.setSize(...size);
        win.setResizable(resizable);
        if (resizable) {
          win.maximize();
        }
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
    await this.connectToDatabase();
    this.showSetupWizardOrDesk(false);
  },
  methods: {
    async connectToDatabase() {
      if (
        process.env.NODE_ENV === 'development' &&
        toBool(process.env.VUE_APP_DELETE_CONFIG)
      ) {
        try {
          console.log('setting lastSelectedFilePath to null');
          config.set('lastSelectedFilePath', null);
          config.set('files', null);
        } catch (ex) {
          console.error(ex);
        }
      }

      let dbpath = ':memory:';

      if (config.get('createNewCompany', false)) {
        frappe.newCompany = config.get('createNewCompany');
        config.set('createNewCompany', false);
      } else {
        const lastSelectedFilePath = config.get('lastSelectedFilePath', null);
        console.log('lastSelectedFilePath', lastSelectedFilePath);

        if (lastSelectedFilePath) {
          //   const files = glob.sync(`${remote.getGlobal('userData')}/*.db`);
          //   if (files.length) {
          //     dbpath = files[0];
          //   }
          // } else {
          dbpath = lastSelectedFilePath;
        }

        if (
          process.env.NODE_ENV === 'development' &&
          toBool(process.env.VUE_APP_DELETE_DB)
        ) {
          try {
            if (dbpath != ':memory:') {
              console.log('deleting db', dbpath);
              fs.unlinkSync(dbpath);
            }
          } catch (ex) {
            console.error(ex);
          }
          dbpath = ':memory:';
        }
      }

      try {
        await connectToLocalDatabase(dbpath);
      } catch (ex) {
        console.error(ex);
      }
    },

    async showSetupWizardOrDesk(
      resetRoute = false,
      isLogin,
      comingFromSetupWizard
    ) {
      const { setupComplete } = frappe.AccountingSettings || {};
      console.log('setupcomplete', setupComplete);
      if (!setupComplete && !isLogin) {
        this.activeScreen = 'SetupWizard';
      } else if (this.$route.path.startsWith('/settings')) {
        this.activeScreen = 'Settings';
      } else {
        let user;
        try {
          user = await Users.getCurrentUser(null, true);
        } catch (ex) {
          console.error(ex);
        }

        if (config.get('authChanged', true)) {
          await Users.logout();
          user = null;
          config.set('authChanged', false);
        }

        console.log('current user', user);

        if (!config.get('lastSelectedFilePath', null) && user && user.remote) {
          console.log(
            'company',
            user.remote.data(),
            dbPath(user.remote.get('name'))
          );
          config.set('lastSelectedFilePath', dbPath(user.remote.get('name')));
          frappe.events.trigger('reload-main-window');
          return;
        }

        //check whether he is logged in or not
        if (user) {
          try {
            if (user.local && user.local.status != 'Active') {
              return showMessageDialog({
                description:
                  'Your account is disabled, please contact your administrator'
              });
            }
            let doc = user.remote;

            if (doc && doc.exists) {
              doc = doc.data();

              console.log('enabled', doc.enabled);
              if (!doc.enabled) {
                return showMessageDialog({
                  description: `Your Account is Disabled, Please contact SpinBi at ${frappe.globalConfig.customerCare.phoneNumber}`
                });
              }

              if (!doc.free) {
                if (!doc.advancePaymentReference) {
                  const billingStart = DateTime.fromJSDate(
                    doc.billingPeriodStart.toDate()
                  );

                  const startDuration = parseInt(
                    -billingStart.diffNow('days').days
                  );

                  console.log('billingStart', startDuration);

                  if (startDuration > frappe.globalConfig.gracePeriodDays) {
                    //make payment
                    await new Promise((resolve, _) => {
                      this.$modal.show(
                        AdvancePayment,
                        {},
                        {
                          height: 'auto'
                        },
                        {
                          'before-close': _ => {
                            resolve();
                          }
                        }
                      );
                    });
                  } else if (startDuration >= 0) {
                    //warn users for payment
                    // await showMessageDialog({
                    //   description: `Your trail expired, please activate in ${frappe
                    //     .globalConfig.gracePeriodDays -
                    //     startDuration} days, please activate before to avoid disruption to your service`,
                    //   buttons: [{ label: 'Ok' }]
                    // });
                    await new Promise((resolve, _) => {
                      this.$modal.show(
                        AdvancePayment,
                        {},
                        {
                          height: 'auto'
                        },
                        {
                          'before-close': _ => {
                            resolve();
                          }
                        }
                      );
                    });
                  }
                }
                const billingEnd = DateTime.fromJSDate(
                  doc.billingPeriodEnd.toDate()
                );
                const duration = parseInt(-billingEnd.diffNow('days').days);
                console.log('billingEnd', duration);

                if (duration > frappe.globalConfig.gracePeriodDays) {
                  //make payment
                  await new Promise((resolve, _) => {
                    this.$modal.show(
                      PaymentForm,
                      {},
                      {
                        height: 'auto'
                      },
                      {
                        'before-close': _ => {
                          resolve();
                        }
                      }
                    );
                  });
                } else if (duration >= 0) {
                  //warn users for payment
                  await showMessageDialog({
                    description: `Your billing is pending, your service will be disabled in ${frappe
                      .globalConfig.gracePeriodDays -
                      duration} days, please pay before to avoid disruption to your service`,
                    buttons: [{ label: 'Ok' }]
                  });
                }
              }
            }
          } catch (ex) {
            console.error(ex);
          }

          SetupSync();

          if (comingFromSetupWizard && !isLogin) {
            // showMessageDialog({
            //   description: `Your billing will start in ${frappe.globalConfig.trialPeriodDays}days. There will be monthly subcription fee of ${frappe.globalConfig.price}`,
            //   buttons: [{ label: 'Ok' }]
            // });
            this.$modal.show(
              TermsAndConditions,
              {},
              {
                height: 'auto'
              }
            );
          }

          if (!frappe.AccountingSettings.gstin) {
            frappe.AccountingSettings.update({
              gstin: frappe.currentUser && frappe.currentUser.gstin
            });
          }

          if (process.env.NODE_ENV !== 'development') {
            this.openBrowser();
          }
          this.activeScreen = 'Desk';
        } else {
          this.activeScreen = 'LoginRegister';
        }

        this.checkForUpdates();
      }
      // if (resetRoute) {
      //   this.$router.replace('/');
      // }
    },
    reloadMainWindowOnSettingsClose() {
      if (this.activeScreen === 'Settings') {
        frappe.events.trigger('reload-main-window');
      }
    },

    checkForUpdates() {
      frappe.events.trigger('check-for-updates');
    },

    async openBrowser() {
      let online = await isOnline();

      if (
        frappe.AccountingSettings.i3msUsername &&
        frappe.AccountingSettings.i3msPassword &&
        online
      ) {
        const credentials = {
          username: frappe.AccountingSettings.i3msUsername,
          password: frappe.AccountingSettings.i3msPassword
        };

        // setup auto tagging
        frappe.events.trigger('auto-tagging');

        frappe.events.trigger('open-browser', {
          credentials,
          showBrowser: true,
          returnCompanyName: true
        });

        // refresh permits
        let permits = await twoMonthsOldPermits();
        frappe.events.trigger('refresh-permits', {
          credentials,
          permits
        });
      } else if (!online) {
        while (!online) {
          await delay(120000);
          online = await isOnline();
        }
        this.openBrowser();
      }

      let i3msUsername = frappe.AccountingSettings.i3msUsername;
      let i3msPassword = frappe.AccountingSettings.i3msPassword;
      const self = this;

      // restart all incase of credentials change
      frappe.AccountingSettings.on('change', doc => {
        if (
          i3msUsername != frappe.AccountingSettings.i3msUsername ||
          i3msPassword != frappe.AccountingSettings.i3msPassword
        ) {
          self.openBrowser();
        }
      });
    }
  }
};
</script>
