const fs = require('node:fs');
const path = require('node:path');

const logging = (logLevel, message) => {
    const folderName = 'logs';

    // Ensure logs folder exists
    if (!fs.existsSync(folderName)) {
        fs.mkdirSync(folderName, { recursive: true });
    }

    // Prepare log file name (YYYY-MM-DD)
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // e.g., 20250806
    const logFileName = `logs_${dateStr}.txt`;
    const logFilePath = path.join(folderName, logFileName);

    // Prepare log message
    const logTime = new Date().toLocaleString();
    const formattedLog = `${logTime}\t[${logLevel}]\t${message}\n`;

    // Print to console
    console.log(formattedLog);

    // Append to file with error handling
    fs.appendFileSync(logFilePath, formattedLog, (err) => {
        if (err) {
            console.error(`Error writing to log file: ${err.message}`);
        }
    });
};

module.exports = logging;
