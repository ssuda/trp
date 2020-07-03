import frappe from 'frappejs';

import { apolloClient, readQuery, readQueryFunction } from '@/hasura';

async function fetchCompanyName() {
  if (!frappe.AccountingSettings.i3msCompanyName) {
    console.log('setting i3ms company');
    frappe.events.trigger('i3ms-company');

    return new Promise((resolve, reject) => {
      frappe.events.on('i3ms-company-name', resolve);
    });
  }

  return Promise.resolve();
}

export async function readTP(query) {
  await fetchCompanyName();

  const companyName = `%${frappe.AccountingSettings.i3msCompanyName}%`;

  console.log('Trying to get data from hasura', companyName);

  console.log(
    readQuery(
      'tp',
      `
        TPNo
        Weight
        StartDate
        Permit
        VehicleNo
        Mineral
        LicenseeName
        Destination
        Source
        Circle
        `
    ).toString()
  );

  const response = await apolloClient.query({
    // Query
    query: readQuery(
      'tp',
      `
        TPNo
        Weight
        StartDate
        Permit
        VehicleNo
        Mineral
        LicenseeName
        Destination
        Source
        Circle
      `
    ),

    variables: {
      where: {
        ...query,
        Transporter: {
          _ilike: companyName
        }
      }
    }
  });

  console.log('response from hasura', response);
  return (response && response.data && response.data.tp) || [];
}

function tpReadFunction() {
  return readQueryFunction(
    'tp_group_by_permit',
    'transporter_permit',
    `
        Date
        Transporter
        Destination
        LicenseeName
        Load
        NumberOfTrips
        Permit
        Source
        Circle
        Material
        `
  );
}

export async function readTPByPermit(query) {
  await fetchCompanyName();

  const companyName = `%${frappe.AccountingSettings.i3msCompanyName}%`;

  console.log('Trying to get data from hasura', companyName);

  const response = await apolloClient.query({
    // Query
    query: tpReadFunction(),

    variables: {
      order_by: { Date: 'asc' },
      args: {
        where: {
          Transporter: {
            _ilike: companyName
          },
          ...query
        }
      }
    }
  });

  console.log('response from hasura', response);
  return (response && response.data && response.data.tp_group_by_permit) || [];
}
