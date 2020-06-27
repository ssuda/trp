const { _ } = require('frappejs/utils');

module.exports = {
  name: 'Driver',
  label: _('Driver'),
  naming: 'license',
  isSingle: 0,
  isChild: 0,
  isSubmittable: 0,
  settings: null,
  keywordFields: [],
  fields: [
    {
      fieldname: 'fullname',
      label: 'Driver Name',
      fieldtype: 'Data',
      placeholder: 'John Doe'
    },
    {
      fieldname: 'license',
      label: 'Driver License',
      fieldtype: 'Data',
      placeholder: 'License',
      required: 1
    },
    {
      fieldname: 'phoneNumber',
      label: 'Phone Number',
      fieldtype: 'Data',
      placeholder: '8788898898',
      validate: {
        type: 'phone'
      }
    }
  ],
  quickEditFields: ['fullname', 'license', 'phoneNumber']
};
