const successResponse = (res, data = null, message = "Success") => {
  return res.json({
    success: true,
    data,
    message,
  });
};

const errorResponse = (res, status = 500, message = "Server error") => {
  return res.status(status).json({
    success: false,
    message,
  });
};

module.exports = {
  successResponse,
  errorResponse,
};
