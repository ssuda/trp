const { DateTime } = require('luxon');
const countryList = require('~/fixtures/countryInfo.json');
const bankNames = require('~/fixtures/bankNames').default;

module.exports = {
  name: 'SetupWizard',
  label: 'Setup Wizard',
  naming: 'name',
  isSingle: 1,
  isChild: 0,
  isSubmittable: 0,
  settings: null,
  keywordFields: [],
  fields: [
    {
      fieldname: 'companyLogo',
      label: 'Company Logo',
      fieldtype: 'AttachImage'
    },
    {
      fieldname: 'country',
      label: 'Country',
      fieldtype: 'AutoComplete',
      placeholder: 'Select Country',
      required: 1,
      default: 'India',
      getList: () => Object.keys(countryList).sort()
    },

    {
      fieldname: 'fullname',
      label: 'Your Name',
      fieldtype: 'Data',
      placeholder: 'John Doe',
      required: 1
    },
    {
      fieldname: 'password',
      label: 'Password',
      fieldtype: 'Password',
      placeholder: 'Password',
      required: 1
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
      fieldname: 'phoneNumber',
      label: 'Phone Number',
      fieldtype: 'Data',
      placeholder: '8788898898',
      required: 1,
      validate: {
        type: 'phone'
      }
    },
    {
      fieldname: 'gstin',
      label: 'GST Number',
      fieldtype: 'Data',
      placeholder: '29AAGCB7383J1Z4',
      required: 1,
      validate: (value, _) => {
        let isValid = /\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/.test(
          value
        );

        if (isValid) {
          let a = 65,
            b = 55,
            c = 36;
          isValid = Array.from(value).reduce((i, j, k) => {
            let p =
              (p =
                (j.charCodeAt(0) < a ? parseInt(j) : j.charCodeAt(0) - b) *
                ((k % 2) + 1)) > c
                ? 1 + (p - c)
                : p;
            return k < 14
              ? i + p
              : j == ((c = c - (i % c)) < 10 ? c : String.fromCharCode(c + b));
          }, 0);
        }
        if (!isValid) {
          throw new frappe.errors.ValidationError(`Invalid gstin: ${value}`);
        }
      }
    },

    {
      fieldname: 'companyName',
      label: 'Company Name',
      placeholder: 'Company Name',
      fieldtype: 'Data',
      required: 1
    },

    {
      fieldname: 'bankName',
      label: 'Bank Name',
      fieldtype: 'AutoComplete',
      placeholder: 'Prime Bank',
      required: 1,
      getList: () => bankNames
    },

    {
      fieldname: 'fiscalYearStart',
      label: 'Fiscal Year Start Date',
      placeholder: 'Fiscal Year Start Date',
      fieldtype: 'Date',
      formula: doc => {
        if (!doc.country) return;
        let today = DateTime.local();
        let fyStart = countryList[doc.country].fiscal_year_start;
        if (fyStart) {
          return DateTime.fromFormat(fyStart, 'MM-dd')
            .plus({ year: [1, 2, 3].includes(today.month) ? -1 : 0 })
            .toISODate();
        }
      },
      required: 1
    },

    {
      fieldname: 'fiscalYearEnd',
      label: 'Fiscal Year End Date',
      placeholder: 'Fiscal Year End Date',
      fieldtype: 'Date',
      formula: doc => {
        if (!doc.country) return;
        let today = DateTime.local();
        let fyEnd = countryList[doc.country].fiscal_year_end;
        if (fyEnd) {
          return DateTime.fromFormat(fyEnd, 'MM-dd')
            .plus({ year: [1, 2, 3].includes(today.month) ? 0 : 1 })
            .toISODate();
        }
      },
      required: 1
    },
    {
      fieldname: 'currency',
      label: 'Currency',
      fieldtype: 'Data',
      placeholder: 'INR',
      formula: doc => {
        if (!doc.country) return;
        return countryList[doc.country].currency;
      },
      required: 1
    },
    {
      fieldname: 'completed',
      label: 'Completed',
      fieldtype: 'Check',
      readonly: 1
    }
  ],
  quickEditFields: [
    'fullname',
    'password',
    'gstin',
    'phoneNumber',
    'bankName',
    'country',
    'currency',
    'fiscalYearStart',
    'fiscalYearEnd'
  ]
};
