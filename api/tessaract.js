const {createScheduler, createWorker, PSM, OEM } = require('tesseract.js');
//var Jimp = require('jimp');
const path = require('path');
const process = require('process');
const captcha_expr = require('./captcha-expression');
const scheduler = createScheduler();

async function addWorker() {
  const dataPath =
  process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '../../data')
    : path.join(process.resourcesPath, 'data');

  console.log('loading from', dataPath);
  const worker = createWorker({
    //workerPath: window.location.origin + '/data/worker.min.js',
    cachePath: dataPath,
    cacheMethod: 'readOnly',
    logger: m => console.log(m),
    //corePath: window.location.origin + '/data/tesseract-core.wasm.js',
  });

  console.log('worker created');

  await worker.load();

  console.log('worker loaded');

  await worker.loadLanguage('eng');

  console.log('worker language loaded');

  await worker.initialize('eng');

  console.log('worker language initialized');

  await worker.setParameters({
    //tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_ocr_engine_mode: OEM.TESSERACT_LSTM_COMBINED
  });

  console.log('worker setparameters');

  scheduler.addWorker(worker);
};

let initialized = false;

async function initialize() {
  if (!initialized) {
    console.log('initializing tesseract');
    for(let i = 0; i < 5; ++i) {
      try {
        await addWorker();
      } catch(ex) {
        console.log(ex);
      }
    }
    initialized = true;
    console.log('initialized tesseract');
  }
}

let initializePromise = initialize();

module.exports = async image => {
  if (!initialized) {
    await initializePromise;
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
