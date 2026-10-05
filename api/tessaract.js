const fs = require('fs');
const os = require('os');
const path = require('path');
const tesseractCli = require('./tesseract');
const captchaExpression = require('./captcha-expression');

const OCR_TIMEOUT = 20000;
const configuredOcrProcesses = Number(process.env.OCR_PROCESSES);
let ocrProcessLimit = Number.isFinite(configuredOcrProcesses)
  ? Math.max(1, Math.min(Math.floor(configuredOcrProcesses), 8))
  : Math.max(1, Math.min(os.cpus().length, 8));
let activeOcrProcesses = 0;
const waitingOcrProcesses = [];

function startWaitingOcrProcesses() {
  while (
    activeOcrProcesses < ocrProcessLimit &&
    waitingOcrProcesses.length
  ) {
    activeOcrProcesses++;
    waitingOcrProcesses.shift()();
  }
}

function setOcrProcessLimit(browserCount) {
  if (Number.isFinite(configuredOcrProcesses)) {
    return ocrProcessLimit;
  }

  const parsedBrowserCount = Math.max(
    1,
    Math.floor(Number(browserCount) || 1)
  );
  ocrProcessLimit = Math.max(
    1,
    Math.min(os.cpus().length, parsedBrowserCount, 8)
  );
  startWaitingOcrProcesses();
  console.log('External OCR process limit:', ocrProcessLimit);
  return ocrProcessLimit;
}

function acquireOcrProcess() {
  if (activeOcrProcesses < ocrProcessLimit) {
    activeOcrProcesses++;
    return Promise.resolve();
  }

  return new Promise(resolve => waitingOcrProcesses.push(resolve));
}

function releaseOcrProcess() {
  activeOcrProcesses--;
  startWaitingOcrProcesses();
}

function externalTesseractBinary() {
  if (process.env.TESSERACT_BINARY) {
    return process.env.TESSERACT_BINARY.replace(/^"|"$/g, '');
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles &&
        path.join(process.env.ProgramFiles, 'Tesseract-OCR', 'tesseract.exe'),
      process.env['ProgramFiles(x86)'] &&
        path.join(
          process.env['ProgramFiles(x86)'],
          'Tesseract-OCR',
          'tesseract.exe'
        ),
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
    ].filter(Boolean);
    const installedBinary = candidates.find(candidate =>
      fs.existsSync(candidate)
    );
    return installedBinary || 'tesseract.exe';
  }

  return 'tesseract';
}

async function recognizeCaptcha(image) {
  if (typeof image === 'string' && /^data:image\//.test(image)) {
    image = Buffer.from(
      image.replace(/^data:image\/[^;]+;base64,/, ''),
      'base64'
    );
  }

  const binary = externalTesseractBinary();
  let text;
  await acquireOcrProcess();
  try {
    text = await tesseractCli.recognize(image, {
      binary,
      lang: 'eng',
      oem: 3,
      psm: 7,
      dpi: 96,
      preserve_interword_spaces: 1,
      timeout: OCR_TIMEOUT
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `External Tesseract executable was not found: ${binary}. ` +
          'Install Tesseract OCR or set TESSERACT_BINARY.'
      );
    }
    throw error;
  } finally {
    releaseOcrProcess();
  }

  const value = captchaExpression(text);
  console.log('External captcha OCR:', text, value);
  return value;
}

recognizeCaptcha.binary = externalTesseractBinary;
recognizeCaptcha.getProcessLimit = () => ocrProcessLimit;
recognizeCaptcha.setProcessLimit = setOcrProcessLimit;

module.exports = recognizeCaptcha;
