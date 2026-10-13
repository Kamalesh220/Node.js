//liste port to start the server using port number
require("dotenv").config();

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const app = require("./src/app");

const http_port = process.env.HTTP_PORT || 4200;
const https_port = process.env.HTTPS_PORT || 4201;

try {
    http.createServer(app).listen(http_port, () => {
        console.log(`HTTP server running on http://localhost:${http_port}`);
    });

  const options = {
    key: fs.readFileSync(path.join(__dirname, process.env.SSL_KEY_PATH)),
    cert: fs.readFileSync(path.join(__dirname, process.env.SSL_CERT_PATH))
  };

  https.createServer(options, app).listen(https_port, () => {
    console.log(`HTTPS server running on ${process.env.HTTPS_URL || `https://localhost:${https_port}`}`);
  });
} catch (err) {
  console.log("HTTPS not started: certificate files not found");
}