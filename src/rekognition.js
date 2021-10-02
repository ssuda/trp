// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
//const path = require('path');
const config = require('./aws.json');

AWS.config.update(config);
//AWS.config.loadFromPath(path.join(__dirname, "aws.json"));

// AWS.config.update({
//   accessKeyId: 'AKIASBUPID2AZPDZJ3EC',
//   secretAccessKey: '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',
//   region: 'ap-south-1'
// });

var textract = new AWS.Textract({ apiVersion: '2018-06-27' });
var rekognition = new AWS.Rekognition({ apiVersion: '2016-06-27' });

module.exports = function(image) {
  return new Promise((resolve, reject) => {
    // var params = {
    //   Document: {
    //     /* required */
    //     Bytes: image
    //   },
    // };

    var params = {
      Image: {
        Bytes: image
      }
    };

    //textract.detectDocumentText(params, function (err, data) {
    rekognition.detectText(params, function(err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err);
      } else {
        console.log(data); // successful response
        const word = data.TextDetections.find(b => b.Type == 'WORD');
        // if (!word) {
        //   return module.exports(image);
        // }
        resolve(word.DetectedText.replace(/[^0-9]/g, ''));
      }
    });
  });
};

if (require.main === module) {
  (async () => {
    console.log(
      await module.exports(require('fs').readFileSync('./captcha.png'))
    );
  })();
}
