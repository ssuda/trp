import { _ } from 'frappejs/utils';

export default {
  doctype: 'TruckList',
  title: _('TruckList'),
  formRoute: name => `/edit/TruckList/${name}`,
  columns: ['name', 'numTrucks']
};
