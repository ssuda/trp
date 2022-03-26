<template>
  <div
    class="pt-6 pb-2 px-2 h-full block window-drag flex justify-between flex-col bg-gray-100"
    :style="sidebarBackground"
  >
    <div class="window-no-drag">
      <WindowControls v-if="platform === 'Mac'" class="px-3 mb-6" />
      <div class="px-3">
        <!-- <h6 class="text-lg font-semibold" @click="$router.push('/')">
          {{ companyName }}
        </h6> -->
        <FormControl
          class="text-base"
          input-class="bg-gray-100 p-2 text-lg font-bold"
          :df="companyField"
          :value="companyName"
          @change="value => companies[value]()"
        />
      </div>
      <div class="mt-3">
        <div class="mt-1 first:mt-0" v-for="group in groups" :key="group.title">
          <div
            class="px-3 py-2 flex items-center rounded-lg cursor-pointer hover:bg-white"
            :class="isActiveGroup(group) && !group.items ? 'bg-white' : ''"
            @click="onGroupClick(group)"
          >
            <component
              :is="group.icon"
              class="w-5 h-5"
              :active="isActiveGroup(group)"
            />
            <div
              class="ml-2 text-lg text-gray-900"
              :class="isActiveGroup(group) && !group.items && 'text-blue-500'"
            >
              {{ group.title }}
            </div>
          </div>
          <div v-if="group.items && isActiveGroup(group)">
            <div
              v-for="item in group.items"
              :key="item.label"
              :v-if="itemVisible(item)"
              class="mt-1 first:mt-0 text-base text-gray-800 py-1 pl-10 rounded cursor-pointer hover:bg-white"
              :class="itemActiveClass(item)"
              @click="onItemClick(item)"
            >
              {{ item.label }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="px-5 pb-3 text-sm text-gray-600">v{{ appVersion }}</div>
  </div>
</template>
<script>
import { remote } from 'electron';
import frappe from 'frappejs';
import glob from 'glob';

import { dbPath, allDBPaths, companyNameFromLastSelectedFilePath } from '@/utils';

import sidebarConfig from '../sidebarConfig';
import WindowControls from './WindowControls';
import FormControl from '@/components/Controls/FormControl';
import config from '@/config';

const fileNameRegex = /([\w ]+)\.db/i;

export default {
  data() {
    return {
      groups: [],
      activeGroup: null
    };
  },

  computed: {
    sidebarBackground() {
      return this.platform === 'Mac'
        ? {
            'background-color': 'rgba(255, 255, 255, 0.6)'
          }
        : null;
    },

    appVersion() {
      return remote.app.getVersion();
    },

    companyName() {
      return companyNameFromLastSelectedFilePath();
    },

    companyField() {
      return {
        fieldtype: 'Select',
        options: Object.keys(this.companies),
        default: this.companyName
      };
    },

    companies() {
      const names = [...allDBPaths(), ...frappe.currentUser.local.companies];
      const ret = names.reduce((p, companyName) => {
        p[companyName] = () => this.selectCompany(dbPath(companyName));
        return p;
      }, {});
      ret['Create'] = () => this.createNewCompany();
      console.log(ret, this.companyName);
      return ret;
    }
  },

  components: {
    WindowControls,
    FormControl
  },

  async mounted() {
    this.groups = sidebarConfig.groups;

    let currentPath = this.$router.currentRoute.fullPath;
    this.activeGroup = this.groups.find(g => {
      if (g.route === currentPath) {
        return true;
      }
      if (g.items) {
        let activeItem = g.items.filter(i => i.route === currentPath);
        if (activeItem.length) {
          return true;
        }
      }
    });
    if (!this.activeGroup) {
      this.activeGroup = this.groups[0];
    }
  },

  methods: {
    itemVisible(item) {
      if (item.condition) {
        return item.condition();
      }

      return true;
    },

    itemActiveClass(item) {
      let { path: currentRoute, params } = this.$route;
      let routeMatch = currentRoute === item.route;
      let doctypeMatch = item.doctype && params.doctype === item.doctype;
      return routeMatch || doctypeMatch ? 'bg-white text-blue-500' : '';
    },

    isActiveGroup(group) {
      return this.activeGroup && group.title === this.activeGroup.title;
    },

    onGroupClick(group) {
      if (group.action) {
        group.action();
      }
      if (group.route) {
        this.routeTo(group.route);
      }
      this.activeGroup = group;
    },

    onItemClick(item) {
      if (item.action) {
        item.action();
      }
      if (item.route) {
        this.routeTo(item.route);
      }
    },

    routeTo(route) {
      this.$router.push(route);
    },

    selectCompany(filepath) {
      console.log('switching to', filepath);
      config.set('lastSelectedFilePath', filepath);
      frappe.events.trigger('relaunch-app');
    },

    createNewCompany() {
      config.set('createNewCompany', {
        fullname: frappe.AccountingSettings.fullname,
        email: frappe.AccountingSettings.email
      });
      frappe.events.trigger('relaunch-app');
    }
  }
};
</script>
