import { db } from "../_firebase.js";
import { sendMailFromTemplate } from "../lib/mailer.js";

export default async function handler(req, res) {
  // ✅ PRE-FLIGHT
  if (req.method === "OPTIONS") {
    return res.status(200)
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type")
      .end();
  }

  // ❌ MÉTODO NO PERMITIDO
  if (req.method !== "POST") {
    return res.status(405)
      .setHeader("Access-Control-Allow-Origin", "*")
      .json({ message: "Método no permitido" });
  }

  try {
    const { tipoEnvio, pago } = req.body;

    if (!pago?.id || !pago.clienteId) {
      return res.status(400).json({ message: "Pago inválido" });
    }

    /* ================= REMITENTE (ADMIN) ================= */
    const adminSnap = await db
      .collection("usuarios")
      .where("role", "==", "admin")
      .where("activo", "==", true)
      .limit(1)
      .get();

    if (adminSnap.empty) {
      return res.status(404).json({ message: "Admin no encontrado" });
    }

    const remitente = {
      id: adminSnap.docs[0].id,
      ...adminSnap.docs[0].data(),
    };

    /* ================= CLIENTE ================= */
    const clienteSnap = await db
      .collection("clientes")
      .doc(pago.clienteId)
      .get();

    if (!clienteSnap.exists) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    const cliente = clienteSnap.data();

    /* ================= PLANTILLA ================= */
    const plantillaSnap = await db
      .collection("plantillasCorreo")
      .where("tipo", "==", tipoEnvio)
      .where("activa", "==", true)
      .limit(1)
      .get();

    if (plantillaSnap.empty) {
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    const plantilla = {
      id: plantillaSnap.docs[0].id,
      ...plantillaSnap.docs[0].data(),
    };

    /* ================= PAGO ENRIQUECIDO ================= */
    const pagoConCliente = {
      ...pago,
      clienteEmail: cliente.email,
      clienteNombre: cliente.nombre,
    };

    /* ================= ENVÍO ================= */
    //await sendMailFromTemplate(remitente, plantilla, pagoConCliente);
    const enviado = await sendMailFromTemplate(
      remitente,
      plantilla,
      pagoConCliente
    );

    // 🔥 SIEMPRE responder 200
    return res.status(200).json({
      success: true,
      enviado,
    });

    //return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}