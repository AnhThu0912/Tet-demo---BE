const { successResponse } = require("../utils/response");

const healthCheck = async (req, res) => {
  console.log("==>> healthCheck");
  return successResponse(res, null, "API Tiệm cà phê của chị ba đang chạy");
};
module.exports = {
  healthCheck,
};
