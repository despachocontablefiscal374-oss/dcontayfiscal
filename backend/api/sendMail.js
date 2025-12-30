import nodemailer from "nodemailer";
import { db } from "./_firebase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const { email, nombre } = req.body;

  if (!email || !nombre) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  try {
    // 🔹 Ejemplo: guardar log en Firestore
    await db.collection("logs").add({
      email,
      nombre,
      fecha: new Date(),
    });

    // 🔹 Configurar correo
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to: email,
      subject: "Prueba de correo",
      html: `<h2>Hola ${nombre}</h2><p>Correo enviado correctamente.</p>`,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno" });
  }
}
