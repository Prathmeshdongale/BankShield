/**
 * Standard API Response utilities
 */
export const success = (res, data = null, message = 'Success', status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const failure = (res, error = 'An error occurred', status = 400, details = null) => {
  return res.status(status).json({
    success: false,
    error,
    ...(details && { details }),
  });
};

export default { success, failure };
