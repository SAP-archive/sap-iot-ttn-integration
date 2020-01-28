const mqtt = require('mqtt')
const fs = require("fs");
const ttn = require("ttn")
const express = require('express');
const readline = require('readline');

const HOST_ADDRESS = "afdd38ab-eb7c-4717-a639-b2ba4891bf69.eu10.cp.iot.sap"; // Replace with your IoT Service instance
const CAPABILITY_ALTERNATE_ID = "ttn_env_tracker_capability"; // replace with the alternate id of your capability
const ROUTER_DEVICE_ALTERNATE_ID = "ttn_router_device"; // replace with the alternate id of your router device
const CERTIFICATE_FILE = "./certificates/ttn_router_device-device_certificate.pem";
const PASSPHRASE_FILE = "./certificates/ttn_router_device-device_certificate.txt";

var APP_FILE = "app_list.txt"

// you might want to use a health check endpoint instead of a web app to make it clear that the app starts up fine
const app = express();

app.get('/', function (req, res) {
  res.send('Hello World!');
});

const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('myapp listening on port ' + port);
});

// storing the names and the secret of the apps into a file for better security and better operations support
const rl = readline.createInterface({
  input: fs.createReadStream(APP_FILE),
  crlfDelay: Infinity
});

rl.on('line', function(line) {
  console.log(`Line from file: ${line}`);
  var applines = line.split('|');
  console.log(applines[0]);
  console.log(applines[1]);
  // discover handler and open mqtt connection
  var data = ttn.data
  data(applines[0], applines[1])
    .then(function (client) {
      client.on("uplink", function (devID, payload) {
        console.log("Received uplink from ", devID)
        console.log(payload)
        sendDataViaMQTT(payload.dev_id, payload.payload_fields)
      })
    })
    .catch(function (err) {
      console.error(err)
      process.exit(1)
    })
});

var mqttClient = connectToMQTT()

// capability alternate id is hardcoded, could also be derived from the incoming app id and port coming in from ttn
function sendDataViaMQTT(dev_id, payload_fields) {
    var newpayload = {
        sensorAlternateId: dev_id,
        capabilityAlternateId: CAPABILITY_ALTERNATE_ID,
        measures: [payload_fields]
    }
// we could use the lora timstamp wiht the message to be moree precise timewise
// you could track the device id in the ingested data to know which device has sent which data sets
    var topicName = 'measures/' + dev_id;

    console.log(newpayload);
    mqttClient.subscribe('ack/' + dev_id);
    mqttClient.publish(topicName, JSON.stringify(newpayload), [], error => {
        if(!error) {
            //console.log("Data successfully sent!");
        } else {
            console.log("An unexpected error occurred:", error);
        }
    });
}

function connectToMQTT() {
    var options = {
        keepalive: 10,
        clientId: ROUTER_DEVICE_ALTERNATE_ID,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 2000,
        cert: fs.readFileSync(CERTIFICATE_FILE),
        key: fs.readFileSync(CERTIFICATE_FILE),
        passphrase: fs.readFileSync(PASSPHRASE_FILE).toString(),
        rejectUnauthorized: false
    };

    // if you run this application 2 times the router connections will fail alternatively - so if you do deploy it to the cloud stop your local instance

    var mqttClient = mqtt.connect(`mqtts://${HOST_ADDRESS}:8883`, options);

    mqttClient.on('connect', () => console.log("Connection established!"));
    mqttClient.on("error", err => console.log("Unexpected error occurred:", err));
    mqttClient.on('reconnect', () => console.log("Reconnected!"));
    mqttClient.on('close', () => console.log("Disconnected!"));
    // in production use request for aknlowedgement is often ommited to save resources
    mqttClient.on('message', (topic, msg) => console.log("Received acknowledgement for message:", msg.toString()));

    return mqttClient
}
