const errorHandler = (err, req, res, next) => {
    // Log the error stack
    console.error('Error occurred:', err.message);
    console.error(err.stack);

    // Check if the error is a validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            message: 'Validation Error',
            errors: err.errors, // Send back validation errors
        });
    }

    // Handle other types of errors
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    });
};

export default errorHandler;
