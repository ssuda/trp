const {
  Blob,
  blobFrom,
  blobFromSync,
  File,
  fileFrom,
  fileFromSync,
  FormData,
  Headers,
  Request,
  Response
} = require('node-fetch');

const fetch = require('node-fetch');

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

const path = require('path');

const fs = require('fs');

const { GoogleGenAI, Type } = require('@google/genai');

let ai, geminiAPIKey;

async function main(data, config) {
  if (!ai || config.geminiAPIKey != geminiAPIKey) {
    geminiAPIKey = config.geminiAPIKey;
    ai = new GoogleGenAI({ apiKey: geminiAPIKey });
  }

  const response = await ai.models.generateContent({
    model: config.geminiModel, //'gemini-2.0-flash',
    contents: [
      {
        text:
          'Extract all the truck numbers from the given images. truck numbers indian truck numbers'
      },
      {
        inlineData: {
          data,
          mimeType: config.type
        }
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          pattern: '[a-zA-Z]{2}W*[0-9]{2}W*(a-zA-Z){1,2}W*[0-9]{3,4}'
        }
      }
    }
  });

  console.debug(response.text);
  return response.text;
}

module.exports = async function(file) {
  let result = await main(fs.readFileSync(file.path, 'base64'), file);
  result = JSON.parse(result)
    .map(s => s.toUpperCase().replace(/[^\w]/g, ''))
    .map(truck => {
      if (truck[0] == '0') {
        truck = 'O' + truck.slice(1);
      }
      if (truck[1] == '0' || truck[1] == 'B') {
        truck = truck[0] + 'D' + truck.slice(2);
      }
      if (truck[2] == 'I') {
        truck = truck.substr(0, 2) + '1' + truck.slice(3);
      }
      if (truck[2] == 'O') {
        truck = truck.substr(0, 2) + '0' + truck.slice(3);
      }
      if (truck[2] == 'S') {
        truck = truck.substr(0, 2) + '5' + truck.slice(3);
      }
      if (truck[2] == 'M' || truck[2] == 'Y') {
        truck = truck.substr(0, 2) + '4' + truck.slice(3);
      }
      if (truck[3] == 'M' || truck[3] == 'Y') {
        truck = truck.substr(0, 3) + '4' + truck.slice(4);
      }
      if (truck[3] == 'I') {
        truck = truck.substr(0, 3) + '1' + truck.slice(4);
      }
      if (truck[3] == 'O') {
        truck = truck.substr(0, 3) + '0' + truck.slice(4);
      }
      if (truck[3] == 'S') {
        truck = truck.substr(0, 3) + '5' + truck.slice(4);
      }
      return truck;
    })
    .join('\n');

  console.log('trucks', result);
  return result;
};

if (require.main === module) {
  const fs = require('fs');
  (async () => {
    let result = await module.exports(
      'C:\\Users\\Sambasiva\\Downloads\\ocr1.jpg',
      'image/jpeg'
    );
    console.log('result', result);
  })();
}
