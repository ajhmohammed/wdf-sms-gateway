var fs = require('node:fs')

const logging = (logLevel, message) => {

    // log file
    logFileName = 'logs.txt'

    // Date time
    logTime = new Date().toLocaleString();

    // log level [Error, Info, warn]
    logLevel = "[" + logLevel + "]";

    // Message
    message = message; 

    logMessage = logTime + "\t" + logLevel + "\t" + message + "\n";

    console.log(logMessage);

    fs.appendFile(logFileName, logMessage, function (err) {})

}

module.exports = logging