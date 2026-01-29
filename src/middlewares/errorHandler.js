const errorHandler = (err, req, res, next) => {
  // Log the error stack in all environments
  console.error('Error occurred:', err.message);
  console.error(err.stack);

  // Determine status code and message
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors;

  // Handle specific error types
  switch (err.name) {
    case 'ValidationError': // Mongoose validation error
      return res.status(400).json({
        success: false,
        error: {
          code: 400,
          type: 'ValidationError',
          message: 'Validation failed',
          errors: err.errors,
          ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
      });

    case 'ForbiddenError':
    case 'UnauthorizedError':
      // Use the existing message from your custom errors
      break;

    case 'MongoServerError':
      if (err.code === 11000) {
        message = 'Duplicate key error';
        errors = { [Object.keys(err.keyPattern)[0]]: 'This value already exists' };
      }
      break;

    default:
      // For unhandled errors in production, generic message
      if (process.env.NODE_ENV === 'production') {
        message = 'Something went wrong!';
      }
  }

  // Construct error response
  const errorResponse = {
    success: false,
    error: {
      code: statusCode,
      type: err.name || 'ServerError',
      message,
      ...(errors && { errors }), // Include sub-errors if present
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        fullError: err 
      })
    }
  };

  res.status(statusCode).json(errorResponse);
};
export { errorHandler };

export default errorHandler;