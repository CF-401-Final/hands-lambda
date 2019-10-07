// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
var DDB = new AWS.DynamoDB({ apiVersion: "2012-10-08" });

// Add ApiGatewayManagementApi to the AWS namespace
// require('aws-sdk/clients/apigatewaymanagementapi');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

const { TABLE_NAME } = process.env;

exports.handler = async (event, context, callback) => {
  console.log('event', event);
  let connectionData;
  
  const postData = JSON.parse(event.body).data;
  console.log('postData', postData);
  var putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: { S: event.requestContext.connectionId },
      vote: { S: postData },
      timeVoted: { S: Date.now().toString() }
    }
  };

  await DDB.putItem(putParams, function (err) {
    callback(null, {
      statusCode: err ? 500 : 200,
      body: err ? "Failed to connect: " + JSON.stringify(err) : "Connected."
    });
  });
  
  
  
  try {
    connectionData = await ddb.scan({ TableName: TABLE_NAME}).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  console.log('connection data', connectionData);
   //Tally up the votes
   let data = {
     zeroCount: 0,
     oneCount: 0,
     twoCount: 0,
     threeCount: 0,
     fourCount: 0,
     fiveCount: 0,
     totalConnections: 0
   }
  
   connectionData.Items.forEach(connection =>{
     if(connection.vote){
       if(connection.vote === "0"){
         data.zeroCount++;
       }else if(connection.vote === "1"){
         data.oneCount++;
       }else if(connection.vote === "2"){
         data.twoCount++;
       }else if(connection.vote === "3"){
         data.threeCount++;
       }else if(connection.vote === "4"){
         data.fourCount++;
       }else if(connection.vote === "5"){
         data.fiveCount++;
       }
     }
   })
  data.totalConnections = connectionData.Count;
     console.log('data',data);
   
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
  });
  
 
  let finalData = JSON.stringify(data);
  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: finalData }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await ddb.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};
