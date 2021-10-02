// Imports the Google Cloud client libraries
const path = require('path');
const captcha_expr = require('./captcha-expression');

// try {
//   process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
//     __dirname,
//     'vision-key.json'
//   );
// } catch (ex) {
//   process.env.GOOGLE_APPLICATION_CREDENTIALS = 'vision-key.json';
// }

const vision = require('@google-cloud/vision');
const fs = require('fs');

// Creates a client
const client = new vision.ImageAnnotatorClient({
  credentials: require('./vision-key.json')
});

module.exports = async function(content) {
  const request = {
    image: { content }
  };

  const [result] = await client.textDetection(request);
  const annotation = result.fullTextAnnotation;
  console.log(annotation.text);
  return captcha_expr(annotation.text);
};

if (require.main == module) {
  module.exports(fs.readFileSync(process.argv[2]));
}
