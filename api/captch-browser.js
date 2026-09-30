const recognizeCaptcha = require('./tessaract');

// OCR runs in the same process as the tagging windows. This avoids converting
// every captcha to base64 and making a main -> renderer -> main IPC round trip.
// Extra arguments from older call sites are harmless in JavaScript.
module.exports = async function recognizeCaptchaForTagging(image) {
  return recognizeCaptcha(image);
};
