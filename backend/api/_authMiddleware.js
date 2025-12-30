import { auth, db } from "../backend/_firebase.js";

export async function verifyAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token no proporcionado" });
    }

    const token = header.split(" ")[1];
    const decoded = await auth.verifyIdToken(token);

    const userRef = db.collection("usuarios").doc(decoded.uid);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "Usuario no registrado" });
    }

    const userData = snap.data();

    if (!userData.activo) {
      return res.status(403).json({ message: "Usuario inactivo" });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: userData.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido" });
  }
}