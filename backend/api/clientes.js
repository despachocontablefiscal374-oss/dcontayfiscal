import { verifyAuth } from "./_authMiddleware.js";
import { requireRole } from "./_roleMiddleware.js";

export default async function handler(req, res) {
  // middleware manual (Vercel style)
  await new Promise((resolve, reject) =>
    verifyAuth(req, res, (err) => (err ? reject(err) : resolve()))
  );

  await new Promise((resolve, reject) =>
    requireRole("admin")(req, res, (err) =>
      err ? reject(err) : resolve()
    )
  );

  if (req.method === "GET") {
    return res.json({
      message: "Clientes visibles solo para admin",
      user: req.user,
    });
  }

  res.status(405).json({ message: "Método no permitido" });
}
