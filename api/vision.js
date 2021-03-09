// Imports the Google Cloud client libraries
const path = require('path');
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, 'spinbi-trp-key.json');
const vision = require('@google-cloud/vision');
const fs = require('fs');

// Creates a client
const client = new vision.ImageAnnotatorClient();

module.exports = async function(content){
const request = {
  image: {content},
};

  const [result] = await client.textDetection(request);
  const annotation = result.fullTextAnnotation;
  console.log(annotation.text.replace(/[^0-9]/g, ''));
  return annotation.text.replace(/[^0-9]/g, '');
};


if (require.main == module) {
  module.exports(fs.readFileSync(process.argv[2]));
}
