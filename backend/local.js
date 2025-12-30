import app from "./api/index.js";

const PORT = 4000;

app.listen(PORT, () => {
  console.log(`Servidor local en http://localhost:${PORT}`);
});
