// middleware/logger.js

app.use((req, res, next) => {
    console.log(`Request Method: ${req.method}, Request URL: ${req.url}`);
    next();
});

export default logger; // Export the logger function
