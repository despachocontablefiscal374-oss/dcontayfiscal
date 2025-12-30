import admin from "../_firebase.js";
import { db, auth } from "../_firebase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    /* ==========================
       GET - LISTAR
    ========================== */
    if (req.method === "GET") {
      const snapshot = await db.collection("usuarios").get();
      const usuarios = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        password: "******", // SOLO VISUAL
      }));
      return res.status(200).json(usuarios);
    }

    /* ==========================
       POST - CREAR
    ========================== */
    if (req.method === "POST") {
      const { nombreUsuario, correo, password, role, activo } = req.body;

      if (!correo || !password) {
        return res
          .status(400)
          .json({ message: "Correo y contraseña requeridos" });
      }

      const userRecord = await auth.createUser({
        email: correo,
        password,
      });

      const uid = userRecord.uid;

      await db.collection("usuarios").doc(uid).set({
        uid,
        nombreUsuario,
        correo,
        role,
        activo,
        tienePassword: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(201).json({ message: "Usuario creado", uid });
    }

    /* ==========================
       PUT - ACTUALIZAR
    ========================== */
    if (req.method === "PUT") {
      const { uid, nombreUsuario, correo, role, activo } = req.body;

      if (!uid) {
        return res.status(400).json({ message: "UID requerido" });
      }

      await db.collection("usuarios").doc(uid).update({
        nombreUsuario,
        correo,
        role,
        activo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ message: "Usuario actualizado" });
    }

    /* ==========================
       DELETE - ELIMINAR
    ========================== */
    if (req.method === "DELETE") {
      const { uid } = req.query;

      await auth.deleteUser(uid);
      await db.collection("usuarios").doc(uid).delete();

      return res.status(200).json({ message: "Usuario eliminado" });
    }

    /* ==========================
       RESET PASSWORD
    ========================== */
    if (req.method === "PATCH") {
      const { uid } = req.body;

      const user = await auth.getUser(uid);
      await auth.generatePasswordResetLink(user.email);

      return res.status(200).json({
        message: "Correo de restablecimiento enviado",
      });
    }

    return res.status(405).json({ message: "Método no permitido" });
  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
}