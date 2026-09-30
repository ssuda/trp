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

export async function promiseWithTimeout(
  promise,
  timeout,
  message = 'Request timed out'
) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(message);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeout);
  });

  let ret;
  try {
    ret = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return ret;
  } catch (ex) {
    clearTimeout(timeoutId);
    throw ex;
  }
}
