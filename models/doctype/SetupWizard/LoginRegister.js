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
      placeholder: 'password',
      required: 1
    },
    {
      fieldname: 'rememberme',
      label: 'Remember me',
      fieldtype: 'Check',
      placeholder: 'Remember me',
      default: 1
    }
  ],
  quickEditFields: ['email', 'password', 'rememberme']
};
