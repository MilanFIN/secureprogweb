
const express = require('express')
var path = require('path');
const https = require('https');
const http = require('http')
const fs = require('fs');


const publicPath = __dirname + "/public/"

const port = 3000

var key = fs.readFileSync(__dirname + '/certs/selfsigned.key');
var cert = fs.readFileSync(__dirname + '/certs/selfsigned.crt');
var options = {
  key: key,
  cert: cert
};

var app = express()
require('./router')(app);







var server = https.createServer(options, app);
server.listen(port, () => {
	console.log("server starting on port : " + port)
});


  

