const { DateTime } = require('luxon');
const countryList = require('~/fixtures/countryInfo.json');

module.exports = {
  name: 'LoginRegister',
  label: 'Login Register',
  naming: 'name',
  isSingle: 1,
  isChild: 0,
  isSubmittable: 0,
  settings: null,
  keywordFields: [],
  fields: [
    {
      fieldname: 'fullname',
      label: 'Your Name',
      fieldtype: 'Data',
      placeholder: 'John Doe'
    },
    {
      fieldname: 'email',
      label: 'Email',
      fieldtype: 'Data',
      placeholder: 'john@doe.com',
      required: 1,
      validate: {
        type: 'email'
      }
    },
    {
      fieldname: 'password',
      label: 'Password',
      fieldtype: 'Password',
      required: 1
    },
    {
      fieldname: 'companyName',
      label: 'Company Name',
      placeholder: 'Company Name',
      fieldtype: 'Data'
    }
  ],
  quickEditFields: ['fullname', 'email', 'password', 'companyName']
};
