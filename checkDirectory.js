const fs = require('fs');
const path = require('path');

// Adjust the directory path based on where you want to check the files
const dirPath = path.join(__dirname); // This will check the current directory (where the script is)

fs.readdir(dirPath, (err, files) => {
    if (err) throw err;
    console.log(files); // This will log the files in the directory
});
