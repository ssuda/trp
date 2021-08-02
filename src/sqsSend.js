// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');

const config = require('./aws.json');

AWS.config.update(config);

// Create an SQS service object
var sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

module.exports = function(queue, message, delay) {
  const params = {
    QueueUrl: 'https://sqs.ap-south-1.amazonaws.com/140960603777/' + queue,
    MessageBody: JSON.stringify(message)
  };

  if (delay) {
    params.DelaySeconds = delay;
  }

  return new Promise((resolve, reject) => {
    sqs.sendMessage(params, function(err, data) {
      if (err) {
        console.log('Error', err);
        reject(err);
      } else {
        console.log('Success', data);
        resolve(data);
      }
    });
  });
};
