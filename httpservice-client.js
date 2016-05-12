/**
 * Created by Oleg Galaburda on 08.05.16.
 */

var EOL = '\r\n';
var ID_HEADER_NAME = 'x-rid';
var restrictedHeaders = {
  'connection': true,
  'x-rid': true
};
var socket;
//TODO when socket is ready, allow overriding
var socketReady = false;

var Options = null; // TODO populated on initialize object, but might be redundant since many pageswill talk to single serwice worker instance


/**
 * @constructor
 * @alias Deferred
 */
var Deferred = (function() {
  function Deferred() {
    this.promise = new Promise(function(resolve, reject) {
      this.resolve = resolve;
      this.reject = reject;
    }.bind(this));
  }

  return Deferred;
})();

/*
 importScripts(
 '../node_modules/event-dispatcher/dist/event-dispatcher.js'
 );
 //On production must be Secure WSS
 var socket = new WebSocket('ws://localhost/socket-connection');
 */
/*
 Notes:
 https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
 https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
 1. Use Blob to handle base64 binary data transfer
 https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob
 https://www.smashingmagazine.com/2016/02/making-a-service-worker/

 Notes:
 1. Don't use BLOB to standalone, it will not work
 2. Don't use URI parameters, they will register new SW each time params were changed
 3. Service worker must be standalone in one file
 4. It should be a library that can be imported into other service worker to be extended

 Should it use HTTP format or custom JSON? HTTP for compliance or JSON for ease

 for HTTP approach
 on fetch, access body blob via event.request.blob().then() -- in case when no body, blob will have size= 0
 create method header with HTTP 1.0 or append "Connection:close" header
 create identifier header that will be sent back to identify request which received response
 generate headers, put then into blob
 append body
 send

 on result force "Connection: close" in response headers

 on result force "Connection: close" in response headers

 */

var refs = {};

self.addEventListener('install', function(event) {
  var deferred = new Deferred();
  console.log('install', arguments);
  socket = new WebSocket('ws://localhost:8081/httpsocket');
  socket.onopen = function() {
    socketReady = true;
    deferred.resolve();
  };
  socket.onerror = function() {
    console.log('error', arguments);
    //TODO should actually start timeout and try again
    deferred.reject();
  };
  socket.onclose = function() {
    //TODO should actually start timeout and try again
    console.log('close', arguments);
  };

  socket.onmessage = function(event) {
    //TODO parse headers, look for request by id, resolve request
    console.log('message received: ', event);
    var data = splitHTTPResponse(event.data);
    parseHeaders(data.headers, data);
    var response = new Response(data.body, data);
    var id = getIdentifierHeader(data.headers);
    if (id && refs[id] instanceof Deferred) {
      refs[id].resolve(response);
      delete refs[id];
    }
  };
  event.waitUntil(deferred.promise);
});
self.addEventListener('activate', function() {
  console.log('activate', arguments);
  self.clients.claim();
});
self.addEventListener('message', function() {
  console.log('message', arguments);
});
self.addEventListener('fetch', function(event) {
  console.log('fetch', socketReady, event, event.request.url);
  //TODO check if request matches config -- request method and URL regexp
  var deferred = new Deferred();
  event.request.blob().then(function(body) {
    var id = createIdentifier();
    var blob = requestToBlob(event.request, body, id);
    /*
     console.log('Request blob:', blob);
     var reader = new FileReader();
     reader.onloadend = function(event) {
     console.log('Request:', event);
     console.log(event.target.result);
     };
     reader.readAsText(blob);
     */
    if (socketReady) {
      refs[id] = deferred;
      socket.send(blob);
      event.respondWith(deferred.promise);
    }
  });
});
self.addEventListener('sync', function() {
  console.log('sync', arguments);
});
self.addEventListener('push', function() {
  console.log('push', arguments);
});
self.onerror = function() {
  console.log('onError', arguments);
};


console.log('run', self);

/**
 * IMPORTANT: For this function to work, body of the request must be already available
 * @param {Request} request
 * @param {Blob|ArrayBuffer|String|DOMString} body
 * @returns {Blob} request prepared to send as Blob data
 */
function requestToBlob(request, body, id) {
  var blob = new Blob([buildHeaders(request, body, id), body]);
  return blob;
}

function specifyContentLength(request, headersList, body) {
  if (!request.headers.has('Content-Length')) {
    headersList.push('Content-Length: ' + body.size);
  }
}
/**
 *
 * @param {Request} request
 * @returns {string} Headers block for HTTP request
 */
function buildHeaders(request, body, id) {
  var list = createHeadersList(request.headers);
  createRequestHeader(request, list);
  specifyContentLength(request, list, body);
  setIdentifierHeader(id, list);
  forceConnectionCloseHeader(list);
  return list.join(EOL) + EOL + EOL;
}

/**
 *
 * @param {Headers} headers
 * @returns {string[]} List of headers
 */
function createHeadersList(headers) {
  var list = [];
  var iterator = headers.entries();
  var item = null;
  while (!(item = iterator.next()).done) {
    if (restrictedHeaders[item.value[0].toLowerCase()]) continue;
    list.push(item.value.join(': '));
  }
  return list;
}

/**
 *
 * @param {Request} request
 * @param {string[]} headerList
 * @returns {string} Generated request header
 */
function createRequestHeader(request, headerList, httpVersion) {
  var header = request.method + ' ' + request.url + ' ' + 'HTTP/' + (httpVersion || '1.1');
  if (headerList) {
    headerList.unshift(header);
  }
  return header;
}

/**
 *
 * @param {string[]} headersList
 */
function forceConnectionCloseHeader(headersList) {
  headersList.push('Connection: close');
}

var createIdentifier = (function() {
  var __i = 0;

  function createIdentifier() {
    var id = 'r-id-' + ++__i;
    return id;
  }

  return createIdentifier;
})();

function setIdentifierHeader(id, headersList) {
  headersList.push(ID_HEADER_NAME + ': ' + id);
}

function getIdentifierHeader(headers) {
  var value = null;
  if (headers instanceof Headers) {
    value = headers.get(ID_HEADER_NAME);
    headers.delete(ID_HEADER_NAME);
  } else {
    value = headers[ID_HEADER_NAME];
  }
  return value;
}

function splitHTTPResponse(blob) {
  var reader = new FileReaderSync();
  var text = reader.readAsText(blob, 'ascii');
  var index = text.indexOf(EOL + EOL);
  return index > 0 ? {
    headers: text.substr(0, index),
    body: blob.slice(index + 4)
  } : {};
}

function parseHeaders(headers, response) {
  var result = new Headers();
  if (headers) {
    var list = headers.split(EOL);
    parseStatus(list.shift(), response);
    var length = list.length;
    for (var index = 0; index < length; index++) {
      var value = list[index].match(/^([^:]+):\s*(.*)$/);
      if (value) {
        result.append(value[1], value[2]);
        result[value[1]] = value[2]; // just for visibility
      }
    }
  }
  response.headers = result;
}

function parseStatus(header, response) {
  var data = header.match(/^[^\s]+\s+(\d+)\s+(.*)$/);
  if (data) {
    response.status = data[1];
    response.statusText = data[2];
  }
}
