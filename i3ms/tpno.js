const cheerio = require('cheerio');
const request = require('request-promise');
const _ = require('lodash');
const moment = require('moment');

export default async function(truckno, startdate, enddate) {
  const today = startdate || moment().format('MM/D/YYYY');
  const yesterday =
    enddate ||
    moment()
      .subtract(1, 'days')
      .format('MM/D/YYYY');

  console.log(yesterday, today);

  const body = await request({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36'
    },
    method: 'GET',
    url: `https://i3ms.orissaminerals.gov.in/I3MS/ePass/TruckWiseReportDtls.aspx?fromdate=${yesterday}&todate=${today}&truckno=${truckno}&Sourcetype=0`
  });

  const $ = cheerio.load(body);

  let header = false;

  let headers;

  const result = [];
  const $rows = $('#grd_itemlist tr');

  $rows.each((i, el) => {
    if (!header) {
      headers = $(el)
        .find('th')
        .map((i, e) =>
          $(e)
            .text()
            .trim()
        );
      header = true;
    } else {
      const values = $(el)
        .find('td')
        .map((i, e) =>
          $(e)
            .text()
            .trim()
        );
      result.push(_.zipObject(headers, values));
    }
  });

  result.sort((obj1, obj2) => {
    return moment(obj1['Issued On'], 'MM/D/YYYY H:mm:ss a').isBefore(
      moment(obj2['Issued On'], 'MM/D/YYYY H:mm:ss a')
    );
  });

  return result;
}

if (require.main === module) {
  module.exports(process.argv[2]);
}
