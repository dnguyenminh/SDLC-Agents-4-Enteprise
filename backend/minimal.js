const http = require('http');
const server = http.createServer((req, res) => {
    console.log('GOT REQUEST: ' + req.url);
    res.writeHead(200);
    res.end('OK');
});
server.on('connection', () => console.log('GOT CONNECTION'));
server.on('listening', () => console.log('LISTENING'));
server.on('error', (e) => console.log('ERROR: ' + e.message));
server.listen(48722, '0.0.0.0', () => {
    console.log('CALLBACK: LISTENING');
});
