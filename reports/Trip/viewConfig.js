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
      label: 'Reference Type',
      fieldname: 'referenceType',
      placeholder: 'Reference Type'
    },
    {
      fieldtype: 'Link',
      size: 'small',
      placeholder: 'Truck Owner',
      references: 'referenceType',
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
        label: 'Start Date',
        fieldtype: 'Date',
        fieldname: 'date'
      },
      {
        label: 'End Date',
        fieldtype: 'Date',
        fieldname: 'date'
      },
      {
        label: 'LR Number',
        fieldtype: 'Data',
        fieldname: 'lrNumber'
      },
      {
        label: 'TP No',
        fieldtype: 'Date',
        fieldname: 'tpNumber'
      },
      {
        label: 'Loaded',
        fieldtype: 'Float',
        fieldname: 'loadQty',
        width: 0.5
      },
      {
        label: 'Unloaded',
        fieldtype: 'Float',
        fieldname: 'unloadQty',
        width: 0.5
      }
    ];
  }
};

export default viewConfig;
