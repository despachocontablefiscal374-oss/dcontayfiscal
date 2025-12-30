import admin from "firebase-admin";
import { db } from "../_firebase.js";

export default async function handler(req, res) {
  // 🔥 CORS HEADERS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔥 Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token requerido" });
    }

    // 1️⃣ Verificar token Firebase
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2️⃣ Buscar usuario en Firestore
    const userDoc = await db.collection("usuarios").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "Usuario no registrado" });
    }

    const userData = userDoc.data();

    if (!userData.activo) {
      return res.status(403).json({ message: "Usuario inactivo" });
    }

    // 3️⃣ OK
    return res.status(200).json({
      uid,
      rol: userData.role,
      nombreUsuario: userData.nombreUsuario,
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(401).json({ message: "Token inválido" });
  }
}
