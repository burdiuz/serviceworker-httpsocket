'use strict';

var http = require('http');
var net = require('net');

/**
 * @type {http.Server}
 */
var server = http.createServer();

var webSocket = require('websocket-server');
webSocket.addEventListener(webSocket.CLIENT_CONNECTED, function(event) {
  let client = event.data;
  console.log(' -- client connected');
  client.addEventListener(webSocket.Client.MESSAGE_RECEIVED, function(event) {
    if (event.data.type === webSocket.Frame.BINARY_TYPE) {
      console.log(' - message received:', event.data.value.toString('ascii'));
      var response = [];
      var socket = net.connect(8081);
      socket.on('connect', function() { // send request
        console.log(' - socket connected');
        socket.write(event.data.value);
      }).on('data', function(data) { // receive partial response
        response.push(data);
        console.log('DATA:', data.length, data.toString('ascii'));
      }).on('error', function(error) {
        console.log(' - socket error', error);
      }).on('end', function() {
        socket.destroy();
        console.log(' - sending data to client');
        client.send(Buffer.concat(response));
      });
    }
  });
});

// Handling HTTP requests to start WebSocket connection
server.on('upgrade', webSocket);

// Express app for handling static files HTTP requests
var express = require('express');
var app = express();
app.use(function(req, res, next) {
  if (req.path === '/httpsocket') {
  } else {
    next();
  }
});
app.use(function(req, res, next) {
  var headerName = 'x-rid';
  if (req.headers[headerName]) {
    res.setHeader(headerName, req.headers[headerName]);
  }
  next();
});
app.use(express.static('.'));
server.on('request', app);

/*
var blob = Buffer.from('GET /example/image.png HTTP/1.1\r\n' +
  'Content-Length: 0\r\n' +
  'Connection: close\r\n' +
  '\r\n', 'ascii');
*/

server.listen(8081, function() {
  console.log('Server started...');
});

