/const AWS = require('aws-sdk');
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
  if(postData.isInstructor){
    console.log('i am instructor')
    var putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: { S: event.requestContext.connectionId },
      topic: { S: postData.topic },
      timeVoted: { S: Date.now().toString() }
    }
  };

  let newItem = await DDB.putItem(putParams).promise();
  console.log('newitem',newItem);
  }else{
    console.log(postData)
  var putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      connectionId: { S: event.requestContext.connectionId },
      vote: { S: postData.voteValue.toString() },
      temperature: { S: postData.tempValue.toString() },
      timeVoted: { S: Date.now().toString() }
    }
  };

  let newItem = await DDB.putItem(putParams).promise();
  console.log('newitem',newItem);
  
  }
  
  
  try {
    console.log('try');
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
     totalConnections: 0,
     topic: 'Whats Your Understanding',
     temperatureAvg: 2.5
   }
  let sum = 0;
  let tally = 0;
   connectionData.Items.forEach(connection =>{
     if(connection.topic && data.topic === 'Whats Your Understanding'){
       data.topic = connection.topic;
     }
     if(connection.temperature){
       tally++;
       sum+=parseInt(connection.temperature);
     }
     
     
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
    
  let avg = sum/tally;
  data.temperatureAvg = avg;
   
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
