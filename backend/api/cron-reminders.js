import { db } from "../_firebase.js";
import {
  parseFlexibleDate,
  daysDiff,
  alreadySent,
  sendMailFromTemplate
} from "../lib/mailer.js";

export default async function handler(req, res) {
  console.log("🕒 CRON ejecutado:", new Date().toISOString());

  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    /* ================= ADMIN ================= */
    const adminSnap = await db
      .collection("usuarios")
      .where("role", "==", "admin")
      .where("activo", "==", true)
      .limit(1)
      .get();

    if (adminSnap.empty) return res.json({ ok: true });

    const adminData = {
      id: adminSnap.docs[0].id,
      ...adminSnap.docs[0].data(),
    };

    /* ================= PLANTILLAS ================= */
    const plantillas = (await db.collection("plantillasCorreo").get())
      .docs.map(d => ({ id: d.id, ...d.data() }));

    const plantillaRecordatorio = plantillas.find(
      p => p.tipo === "recordatorio" && p.activa
    );

    if (!plantillaRecordatorio) return res.json({ ok: true });

    /* ================= PAGOS ================= */
    const pagos = (await db.collection("pagos").get())
      .docs.map(d => ({ id: d.id, ...d.data() }));

    for (const pago of pagos) {
      if (!pago.fechaVencimiento || !pago.clienteId) continue;

      const fechaVenc = parseFlexibleDate(pago.fechaVencimiento);
      if (!fechaVenc) continue;

      const diasAntes = daysDiff(hoy, fechaVenc);

      // ⏰ Recordatorio 3 días antes
      if (diasAntes !== 3) continue;

      /* ================= CLIENTE ================= */
      const clienteSnap = await db
        .collection("clientes")
        .doc(pago.clienteId)
        .get();

      if (!clienteSnap.exists) continue;

      const cliente = clienteSnap.data();

      const pagoConCliente = {
        ...pago,
        clienteEmail: cliente.email,
        clienteNombre: cliente.nombre,
      };

      const yaEnviado = await alreadySent(
        pago.id,
        "recordatorio",
        cliente.email
      );

      if (!yaEnviado) {
        await sendMailFromTemplate(
          adminData,
          plantillaRecordatorio,
          pagoConCliente
        );
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
