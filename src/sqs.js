// Load the AWS SDK for Node.js
const AWS = require('aws-sdk');

// Create an SQS service object
let sqs;

let writeQueueUrl =
  'https://sqs.ap-south-1.amazonaws.com/166639284387/i3ms-tag-request';
let readQueueUrl =
  'https://sqs.ap-south-1.amazonaws.com/166639284387/i3ms-tag-request';

exports.sendMessage = function(config, message) {
  if (!sqs) {
    AWS.config.update(config);
    // Create an SQS service object
    sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
  }

  const params = {
    QueueUrl: writeQueueUrl,
    MessageBody: JSON.stringify(message)
  };

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

exports.receiveMessage = function(config) {
  if (!sqs) {
    AWS.config.update(config);
    // Create an SQS service object
    sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
  }

  const params = {
    AttributeNames: ['SentTimestamp'],
    MaxNumberOfMessages: 1,
    MessageAttributeNames: ['All'],
    QueueUrl: readQueueUrl
  };

  return new Promise((resolve, reject) => {
    sqs.receiveMessage(params, function(err, data) {
      if (err) {
        console.log('Receive Error', err);
        reject(err);
      } else if (data.Messages) {
        const output = JSON.parse(data.Messages[0].Body);

        const deleteParams = {
          QueueUrl: queueURL,
          ReceiptHandle: data.Messages[0].ReceiptHandle
        };

        sqs.deleteMessage(deleteParams, function(err, data) {
          if (err) {
            console.log('Delete Error', err);
            reject(err);
          } else {
            console.log('Message Deleted', data);
            resolve(output);
          }
        });
      } else {
        console.log('No Messages');
        resolve();
      }
    });
  });
};
