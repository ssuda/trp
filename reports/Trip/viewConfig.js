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
        { label: 'Last 2 Months', value: '2months' },
        { label: 'Last 6 Months', value: '6months' },
        { label: 'This Year', value: 'thisyear' },
        { label: 'Last 12 Months', value: '12months' },
        { label: 'Custom', value: 'custom' }
      ],
      size: 'small',
      label: 'Date Range',
      fieldname: 'dateRange',
      placeholder: 'Date Range',
      default: 'thismonth'
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

          case '2months':
            return d.minus({ months: 2 }).toFormat('yyyy-LL-dd');

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
      formula: filters => {
        if (!filters['dateRange'] || filters['dateRange'] === 'custom') {
          return filters['toDate'];
        }
        console.log('received daterange', filters);
        const d = DateTime.local();
        switch (filters['dateRange']) {
          case 'lastmonth':
            return d
              .minus({ month: 1 })
              .endOf('month')
              .toFormat('yyyy-LL-dd');
        }
      },
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
    // {
    //   fieldtype: 'Link',
    //   size: 'small',
    //   target: 'Permit',
    //   placeholder: 'Permit',
    //   fieldname: 'permit',
    //   label: 'Permit'
    // },
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
    }
    // {
    //   fieldtype: 'Link',
    //   target: 'Customer',
    //   size: 'small',
    //   placeholder: 'Customer',
    //   label: 'Customer',
    //   fieldname: 'customer'
    // }
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

  dimensionFields(filters) {
    return [
      {
        label: 'Permit Wise',
        fieldname: 'permit',
        name: 'Permit'
      },
      {
        label: 'Customer Wise',
        fieldname: 'source',
        name: 'Customer'
      },
      {
        label: 'Mine Wise',
        fieldname: 'transportedFrom',
        name: 'Mine'
      }
    ];
  },

  getColumns(dimensions, filters) {
    const f = this.dimensionFields(filters).filter(
      d => dimensions[d.fieldname]
    );

    return f
      .concat([
        filters.periodicity
          ? {
              label: 'Date',
              fieldtype: 'Data',
              fieldname: 'periodicity'
            }
          : null,
        !dimensions['permit']
          ? {
              label: 'Permits',
              fieldtype: 'Int',
              fieldname: 'numPermits'
            }
          : null,
        {
          label: 'Trips',
          fieldtype: 'Int',
          fieldname: 'numTrips'
        },
        {
          label: 'Qty',
          fieldtype: 'Float',
          fieldname: 'loadQty'
        }
      ])
      .filter(Boolean);
  }
};

export default viewConfig;
