import moment from 'moment';

export async function promiseAny(...promises) {
  return await Promise.race(
    promises.map(
      (p, i) =>
        new Promise(async (r, j) => {
          try {
            await p;
            r(i + 1);
          } catch (ex) {
            j(ex);
          }
        })
    )
  );
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function timeMe(num, txt) {
  let time = moment().format('dddd MM/DD/YYYY HH:mm:ss, ');
  console.log(time, txt);
}
