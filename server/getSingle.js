const frappe = require('frappejs');
const registerServerMethods = require('./registerServerMethods');

module.exports = async function getSingle() {
  frappe.metaCache = frappe.metaCache || {};

  // fetch singles
  // so that they are available synchronously
  await frappe.getSingle('SystemSettings');
  await frappe.getSingle('AccountingSettings');
  await frappe.getSingle('GetStarted');

  // cache currency symbols for frappe.format
  frappe.currencySymbols = await getCurrencySymbols();

  registerServerMethods();
};

function getCurrencySymbols() {
  return frappe.db
    .getAll({
      doctype: 'Currency',
      fields: ['name', 'symbol']
    })
    .then(data => {
      return data.reduce((obj, currency) => {
        obj[currency.name] = currency.symbol;
        return obj;
      }, {});
    });
}
