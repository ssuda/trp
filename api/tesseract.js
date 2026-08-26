const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

/**
 * Run the external Tesseract executable.
 *
 * @param {string|Buffer|Array} input URL, local image path, or image bytes
 * @param {Object} config OCR options and control parameters
 * @returns {Promise<string>} recognized text
 */
function recognize(input, config = {}) {
  const binary = config.binary || 'tesseract';
  const isUrl = typeof input === 'string' && /^https?:\/\//i.test(input);
  const isLocalFile = typeof input === 'string' && !isUrl;
  const inputOption = isLocalFile ? input : 'stdin';
  const args = [inputOption, 'stdout', ...getOptions(config)];

  if (config.debug) {
    console.debug('External Tesseract:', binary, args.join(' '));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      env: {
        ...process.env,
        OMP_THREAD_LIMIT: process.env.OMP_THREAD_LIMIT || '1'
      }
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timeoutId;

    const finish = (error, output) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve(output);
    };

    timeoutId = setTimeout(() => {
      child.kill();
      finish(
        new Error(
          `External Tesseract timed out after ${config.timeout || 20000}ms`
        )
      );
    }, config.timeout || 20000);

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.stdin.on('error', error => {
      if (!settled && error.code !== 'EPIPE') {
        finish(error);
      }
    });
    child.on('error', finish);
    child.on('close', code => {
      const errorOutput = Buffer.concat(stderr)
        .toString()
        .trim();
      if (config.debug && errorOutput) {
        console.debug(errorOutput);
      }
      if (code !== 0) {
        finish(
          new Error(
            errorOutput || `External Tesseract exited with code ${code}`
          )
        );
        return;
      }
      finish(null, Buffer.concat(stdout).toString());
    });

    if (!isLocalFile) {
      pipeInput(input, child).catch(finish);
    }
  });
}

async function pipeInput(input, child) {
  if (typeof input === 'string') {
    const client = input.toLowerCase().startsWith('https:') ? https : http;
    client
      .get(input, response => {
        response.on('error', error => child.stdin.destroy(error));
        response.pipe(child.stdin);
      })
      .on('error', error => child.stdin.destroy(error));
    return;
  }

  if (Array.isArray(input)) {
    input = Buffer.from(input.join('\n'), 'utf-8');
  }
  if (!Buffer.isBuffer(input)) {
    throw new Error('External Tesseract requires image bytes or a file path');
  }
  child.stdin.end(input);
}

function getOptions(config) {
  const options = [];
  const ocrOptions = [
    'tessdata-dir',
    'user-words',
    'user-patterns',
    'psm',
    'oem',
    'dpi'
  ];

  Object.entries(config).forEach(([key, value]) => {
    if (['debug', 'presets', 'binary', 'timeout'].includes(key)) return;
    if (key === 'lang') {
      options.push('-l', String(value));
    } else if (ocrOptions.includes(key)) {
      options.push(`--${key}`, String(value));
    } else {
      options.push('-c', `${key}=${value}`);
    }
  });

  if (Array.isArray(config.presets)) {
    options.push(...config.presets);
  }
  return options;
}

module.exports = {
  recognize
};