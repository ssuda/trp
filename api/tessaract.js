const tesseract = require("./tesseract")
const captcha_expr = require('./captcha-expression')

const config = {
  lang: "eng", // default
  oem: 3,
  psm: 7,
  binary: 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
}

module.exports = async image => {
  image = image.replace('data:image/png;base64,', '')
  image = Buffer(image, 'base64');
  const text = await tesseract.recognize(image, config)
  const val = captcha_expr(text);
  console.log(text, val);
  return val;
};

if (require.main === module) {
  const axios = require('axios');
  (async () => {
    for (let i = 0; i < 100; i++) {
      const resp = await axios.get(
        'https://i3ms.odishaminerals.gov.in/i3ms/pms/Captcha.aspx',
        { responseType: 'arraybuffer' }
      );
      let captchaVal = await module.exports(resp.data);
      console.log('CaptchaVal', captchaVal);
    }
    await scheduler.terminate();
  })();
}

// var dv = require('dv');
// var fs = require('fs');
// var image = new dv.Image('jpg', fs.readFileSync('./Captcha.jpg'));
// var tesseract = new dv.Tesseract('eng', image);
// console.log(tesseract.findText('plain'));
