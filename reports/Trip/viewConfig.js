import { partyWithAvatar } from '@/utils';

let title = 'Trip';

const viewConfig = {
  title,
  filterFields: [
    {
      fieldtype: 'Select',
      options: [
        { label: '', value: '' },
        { label: 'I3MS', value: 'i3ms' },
        { label: 'Non I3MS', value: 'nonI3ms' }
      ],
      size: 'small',
      label: 'Type',
      fieldname: 'referenceType',
      placeholder: 'Type'
    },
    {
      fieldtype: 'Select',
      options: [
        { label: '', value: '' },
        { label: 'DayWise', value: 'day' },
        { label: 'WeekWise', value: 'week' },
        { label: 'MonthWise', value: 'month' }
      ],
      size: 'small',
      label: 'Period',
      fieldname: 'period',
      placeholder: 'Period'
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
      fieldtype: 'Date',
      size: 'small',
      placeholder: 'From Date',
      label: 'From Date',
      fieldname: 'fromDate'
    },
    {
      fieldtype: 'Date',
      size: 'small',
      placeholder: 'To Date',
      label: 'To Date',
      fieldname: 'toDate'
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
      {
        label: 'Customer',
        fieldtype: 'Link',
        fieldname: 'customer'
      },
      {
        label: 'Truck Owner',
        fieldtype: 'Link',
        fieldname: 'truckOwner'
      },
      {
        label: 'Period',
        fieldtype: 'Data',
        fieldname: 'period'
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
      },
      {
        label: 'Unloaded',
        fieldtype: 'Float',
        fieldname: 'unloadQty'
      }
    ];
  }
};

export default viewConfig;
