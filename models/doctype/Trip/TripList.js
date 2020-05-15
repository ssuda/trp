import { _ } from 'frappejs/utils';

export default {
  doctype: 'Trip',
  title: _('Trips'),
  columns: [
    'name',
    'lrNumber',
    'permit',
    'truck',
    'loadQty',
    'unloadQty',
    'startDate',
    'endDate'
  ],
  limit: 100
};
