import nodemailer from "nodemailer";
import { db, admin } from "../_firebase.js";

/* ================= HELPERS ================= */

export function parseFlexibleDate(value) {
  if (!value) return null;
  if (typeof value === "object" && value.seconds)
    return new Date(value.seconds * 1000);
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return new Date(value + "T00:00:00");
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [d, m, y] = value.split("/");
      return new Date(`${y}-${m}-${d}T00:00:00`);
    }
    const maybe = new Date(value);
    if (!isNaN(maybe)) return maybe;
  }
  return null;
}

export function dateToYMD(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function daysDiff(a, b) {
  const A = new Date(a); A.setHours(0, 0, 0, 0);
  const B = new Date(b); B.setHours(0, 0, 0, 0);
  return Math.floor((B - A) / 86400000);
}

export async function alreadySent(pagoId, tipo, clienteEmail) {
  const q = db.collection("historialCorreos")
    .where("pagoId", "==", pagoId)
    .where("tipo", "==", tipo)
    .where("clienteEmail", "==", clienteEmail)
    .limit(1);

  const snap = await q.get();
  return !snap.empty;
}

/* ================= MAIL ================= */

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function renderTemplate(template, vars) {
  let result = template;

  for (const key in vars) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(regex, vars[key]);
  }

  return result;
}


export async function sendMailFromTemplate(remitente, plantilla, pago) {
  const hoy = new Date();
  const fechaVenc = parseFlexibleDate(pago.fechaVencimiento);

  let diasDeAtraso = 0;

  if (fechaVenc && hoy > fechaVenc) {
    diasDeAtraso = daysDiff(fechaVenc, hoy);
  }
  const vars = {
    nombreDelCliente: pago.clienteNombre || "",
    cantidad: pago.monto ? `$${Number(pago.monto).toFixed(2)}` : "",
    fechaDeVencimiento: pago.fechaVencimiento
      ? dateToYMD(parseFlexibleDate(pago.fechaVencimiento))
      : "",
    fechaPago: pago.fechaPago
      ? dateToYMD(parseFlexibleDate(pago.fechaPago))
      : "",
    numeroDeFactura: pago.numeroFactura || "",
    descripcion: pago.descripcion || "",
    nombreDeEmpresa: remitente.nombreUsuario || "Empresa",
    // 🔥 ESTA ES LA CLAVE
    diasDeAtraso,
  };

  const subject = renderTemplate(plantilla.asunto, vars);
  const bodyHtml = renderTemplate(plantilla.cuerpo, vars).replace(/\n/g, "<br>");

  let estado = "Error";
  let errorEnvio = null;
  let info = null;

  try {
    info = await transporter.sendMail({
      from: `"${vars.nombreDeEmpresa}" <${process.env.FROM_EMAIL}>`,
      to: pago.clienteEmail,
      subject,
      html: bodyHtml,
    });

    // ✅ Gmail aceptó al menos un destinatario
    if (info?.accepted?.length > 0) {
      estado = "Enviado";
    } else {
      errorEnvio = "Correo no aceptado por el servidor SMTP";
    }

  } catch (err) {
    errorEnvio = err.message;
  }


  // 🔥 SIEMPRE guardamos el historial
  await db.collection("historialCorreos").add({
    clienteNombre: pago.clienteNombre,
    clienteEmail: pago.clienteEmail,
    tipo: plantilla.tipo,
    asunto: subject,
    cuerpo: bodyHtml,
    pagoId: pago.id,

    estado,
    error: errorEnvio,

    // ✅ REGRESAMOS INFO REAL
    mensajeNodemailer: info || null,

    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });

  return estado === "Enviado";
}
