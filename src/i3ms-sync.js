import frappe from 'frappejs';

import { apolloClient, readQuery, readQueryFunction } from '@/hasura';

export async function readTP(query) {
  if (!frappe.AccountingSettings.i3msCompanyName) {
    await Promise.resolve((resolve, reject) => {
      frappe.events.on('i3ms-company-name', resolve);
    });
  }

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

export async function readTPByPermit(query) {
  if (!frappe.AccountingSettings.i3msCompanyName) {
    await Promise.resolve((resolve, reject) => {
      frappe.events.on('i3ms-company-name', resolve);
    });
  }

  const companyName = `%${frappe.AccountingSettings.i3msCompanyName}%`;

  console.log('Trying to get data from hasura', companyName);

  const response = await apolloClient.query({
    // Query
    query: readQueryFunction(
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
    ),

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
