const {createScheduler, createWorker, PSM, OEM } = require('tesseract.js');
//var Jimp = require('jimp');
const captcha_expr = require('./captcha-expression');

const scheduler = createScheduler();

async function addWorker() {
  const worker = createWorker();

  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');
  await worker.setParameters({
    //tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_ocr_engine_mode: OEM.TESSERACT_LSTM_COMBINED
  });
  scheduler.addWorker(worker);
};

let initialized = false;

async function initialize() {
  if (!initialized) {
    console.log('initializing tesseract');
    for(let i = 0; i < 5; ++i) {
      await addWorker();
    }
    initialized = true;
    console.log('initialized tesseract');
  }
}

(async() => {
  initialize();
})();

module.exports = async image => {
  if (!initialized) {
    await initialize();
  }
  
  const {
    data: { text }
  } = await scheduler.addJob('recognize', image);
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
