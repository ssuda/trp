import { DateTime } from 'luxon';

let title = 'Trip Report';

const viewConfig = {
  title,
  filterFields: [
    {
      fieldtype: 'Select',
      options: [
        { label: 'I3MS', value: 'I3MS' },
        { label: 'Non I3MS', value: 'Non I3MS' }
      ],
      size: 'small',
      label: 'Type',
      default: 'I3MS',
      fieldname: 'type',
      placeholder: 'Type'
    },
    {
      fieldtype: 'Select',
      options: [
        { label: '', value: '' },
        { label: 'Today', value: 'today' },
        { label: 'This Week', value: 'thisweek' },
        { label: 'Last 7 Days', value: '7days' },
        { label: 'This Month', value: 'thismonth' },
        { label: 'Last 30 Days', value: '30days' },
        { label: 'Last Month', value: 'lastmonth' },
        { label: 'Last 6 Months', value: '6months' },
        { label: 'This Year', value: 'thisyear' },
        { label: 'Last 12 Months', value: '12months' },
        { label: 'Custom', value: 'custom' }
      ],
      size: 'small',
      label: 'Date Range',
      fieldname: 'dateRange',
      placeholder: 'Date Range',
      default: 'thisyear'
    },
    {
      fieldtype: 'Date',
      size: 'small',
      placeholder: 'From Date',
      condition: filters => filters['dateRange'] === 'custom',
      formula: filters => {
        if (!filters['dateRange'] || filters['dateRange'] === 'custom') {
          console.log(typeof filters['fromDate'], filters['fromDate']);
          return filters['fromDate'];
        }
        console.log('received daterange', filters);
        const d = DateTime.local();
        switch (filters['dateRange']) {
          case 'today':
            return d.toFormat('yyyy-LL-dd');

          case 'thisweek':
            return d.startOf('week').toFormat('yyyy-LL-dd');

          case '7days':
            return d.minus({ days: 7 }).toFormat('yyyy-LL-dd');

          case '30days':
            return d.minus({ days: 30 }).toFormat('yyyy-LL-dd');

          case 'thismonth':
            return d.startOf('month').toFormat('yyyy-LL-dd');

          case 'lastmonth':
            return d
              .minus({ month: 1 })
              .startOf('month')
              .toFormat('yyyy-LL-dd');

          case 'thisyear':
            return d.startOf('year').toFormat('yyyy-LL-dd');

          case '6months':
            return d.minus({ months: 6 }).toFormat('yyyy-LL-dd');

          case '12months':
            return d.minus({ months: 12 }).toFormat('yyyy-LL-dd');
        }
      },
      label: 'From Date',
      fieldname: 'fromDate'
    },
    {
      fieldtype: 'Date',
      size: 'small',
      placeholder: 'To Date',
      label: 'To Date',
      fieldname: 'toDate',
      condition: filters => filters['dateRange'] === 'custom'
    },
    {
      fieldtype: 'Select',
      options: [
        { label: '', value: '' },
        { label: 'Daywise', value: 'day' },
        { label: 'Weekwise', value: 'week' },
        { label: 'Monthwise', value: 'month' }
      ],
      size: 'small',
      label: 'Period',
      fieldname: 'periodicity',
      placeholder: 'Periodicity'
    },
    {
      fieldtype: 'Link',
      size: 'small',
      target: 'Permit',
      placeholder: 'Permit',
      fieldname: 'permit',
      label: 'Permit'
    },
    {
      fieldtype: 'Link',
      size: 'small',
      target: 'Truck',
      placeholder: 'Truck',
      fieldname: 'truck',
      label: 'Truck'
    },
    {
      fieldtype: 'Link',
      size: 'small',
      target: 'Supplier',
      placeholder: 'Truck Owner',
      fieldname: 'truckOwner',
      label: 'Truck Owner'
    },
    {
      fieldtype: 'Link',
      target: 'Customer',
      size: 'small',
      placeholder: 'Customer',
      label: 'Customer',
      fieldname: 'customer'
    },
    {
      fieldtype: 'Data',
      size: 'small',
      placeholder: 'Mine',
      label: 'Mine',
      fieldname: 'transportedFrom'
    },
    {
      fieldtype: 'Data',
      size: 'small',
      placeholder: 'Destination',
      label: 'Destination',
      fieldname: 'destination'
    }
  ],
  method: 'trip-report',
  linkFields: [
    {
      label: 'Clear Filters',
      type: 'secondary',
      action: async report => {
        await report.getReportData({});
        report.usedToReRender += 1;
      }
    },
    {
      label: 'Export',
      type: 'primary',
      action: () => {}
    }
  ],
  getColumns() {
    return [
      // {
      //   label: 'Customer',
      //   fieldtype: 'Link',
      //   fieldname: 'customer'
      // },
      // {
      //   label: 'Truck Owner',
      //   fieldtype: 'Link',
      //   fieldname: 'truckOwner'
      // },
      {
        label: 'Mine',
        fieldtype: 'Link',
        fieldname: 'transportedFrom'
      },
      {
        label: 'Destination',
        fieldtype: 'Link',
        fieldname: 'destination'
      },
      {
        label: 'Periodicity',
        fieldtype: 'Data',
        fieldname: 'periodicity'
      },
      {
        label: 'Number of Orders',
        fieldtype: 'Int',
        fieldname: 'numPermits'
      },
      {
        label: 'Number of Trips',
        fieldtype: 'Int',
        fieldname: 'numTrips'
      },
      {
        label: 'Loaded',
        fieldtype: 'Float',
        fieldname: 'loadQty'
      }
      // {
      //   label: 'Unloaded',
      //   fieldtype: 'Float',
      //   fieldname: 'unloadQty'
      // }
    ];
  }
};

export default viewConfig;
