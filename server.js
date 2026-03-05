require("dotenv").config();
const app = require("./src/app");

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server đang chạy cổng ${PORT}`);
});
