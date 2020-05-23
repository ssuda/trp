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
import { connectToLocalDatabase, connectToRemoteDatabase } from '@/utils';
import { getMainWindowSize } from '@/screenSize';
import config from '@/config';

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
        await connectToRemoteDatabase();
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
      this.showSetupWizardOrDesk(
        false,
        setupComplete && process.env.NODE_ENV !== 'development'
      );
    }
  },
  methods: {
    async showSetupWizardOrDesk(resetRoute = false, isLogin) {
      const { setupComplete } = frappe.AccountingSettings;
      if (!setupComplete && !isLogin) {
        this.activeScreen = 'SetupWizard';
      } else if (this.$route.path.startsWith('/settings')) {
        this.activeScreen = 'Settings';
      } else {
        //check whether he is logged in or not
        console.log('firebaseUser', firebaseAuth.currentUser);
        if (firebaseAuth.currentUser) {
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
