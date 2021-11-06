'use strict';

const http = require('http');
const net = require('net');

/**
 * @type {http.Server}
 */
const server = http.createServer();

const { default: webSocket } = require('websocket-server');

webSocket.addEventListener(webSocket.CLIENT_CONNECTED, (event) => {
  let client = event.data;
  console.log(' -- client connected');
  client.addEventListener(webSocket.Client.MESSAGE_RECEIVED, (event) => {
    if (event.data.type === webSocket.Frame.BINARY_TYPE) {
      console.log(' - message received:', event.data.value.toString('ascii'));
      const response = [];
      const socket = net.connect(8081);
      socket.on('connect', () => { // send request
        console.log(' - socket connected');
        socket.write(event.data.value);
      }).on('data', (data) => { // receive partial response
        response.push(data);
        console.log('DATA:', data.length, data.toString('ascii'));
      }).on('error', (error) => {
        console.log(' - socket error', error);
      }).on('end', () => {
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
const express = require('express');
const app = express();
app.use((req, res, next) => {
  if (req.path === '/httpsocket') {
  } else {
    next();
  }
});
app.use((req, res, next) => {
  const headerName = 'x-rid';
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

server.listen(8081, () => {
  console.log('Server started...');
});

