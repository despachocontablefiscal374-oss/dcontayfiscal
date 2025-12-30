// src/components/Recordatorios.jsx
import { useState, useEffect, useRef } from "react";
import { Button, Form, Table, Badge, Modal, Offcanvas, Container, Row, Col, Spinner } from "react-bootstrap";
import { ArrowLeft, Plus, Download, Eye, Edit, Trash2, Mail, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import { db } from "../firebaseConfig"; // asumes export const db = getFirestore(app)
import { collection, writeBatch, getDocs, query, where, orderBy, doc, updateDoc, addDoc } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import logo from "../assets/logo.png";
import { useError } from "../context/ErrorContext";

function parseDateFlexible(str) {
  if (!str) return null;
  // try ISO / YYYY-MM-DD
  const asIso = new Date(str);
  if (!isNaN(asIso)) return asIso;
  // try dd/mm/yyyy
  const parts = String(str).split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return new Date(`${y}-${m}-${d}`);
  }
  return null;
}
function daysDiff(a, b) {
  // returns integer days from a to b: (b - a) in days
  const da = new Date(a); da.setHours(0, 0, 0, 0);
  const db = new Date(b); db.setHours(0, 0, 0, 0);
  const diffMs = db - da;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export default function Recordatorios() {
  const navigate = useNavigate();

  // data
  const [plantillas, setPlantillas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [usuarioAdmin, setUsuarioAdmin] = useState(null);

  // correo
  const API_URL = "http://localhost:4001";

  // UI
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [message, setMessage] = useState(null);
  ///
  const [adminEmail, setAdminEmail] = useState(null);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const { setError } = useError();


  // filtros/paginación (copiado de tu estilo)
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);

  const autoRef = useRef(null);

  // Historial de correos
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [historialSearch, setHistorialSearch] = useState("");
  const [historialPage, setHistorialPage] = useState(1);
  const [historialPerPage, setHistorialPerPage] = useState(10);
  const [detalleCorreo, setDetalleCorreo] = useState(null);
  const [showDetalleCorreo, setShowDetalleCorreo] = useState(false);
  const [showConfirmVaciarHistorial, setShowConfirmVaciarHistorial] = useState(false);


  const vaciarHistorial = async () => {
    try {
      if (usuarioAdmin?.role !== "admin") {
        setError("No tienes permisos para realizar esta acción.");
        return;
      }

      const snap = await getDocs(collection(db, "historialCorreos"));
      const batch = writeBatch(db);

      snap.docs.forEach(docu => {
        batch.delete(docu.ref);
      });

      await batch.commit();

      setHistorial([]);
      setShowConfirmVaciarHistorial(false);
      setMessage({ type: "success", text: "Historial eliminado correctamente." });

    } catch (err) {
      console.error(err);
      setMessage({ type: "danger", text: "Error al eliminar el historial." });
    }
  };


  const handleGuardar = () => {
    if (!usuarioAdmin || usuarioAdmin.role !== "admin") {
      setError("No tienes permisos para realizar esta acción.");
      return;
    }
  };
  // Cargar datos iniciales
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      try {
        setLoading(true);

        // 1) admin activo (role: 'admin' y activo: true)
        const qAdmin = query(collection(db, "usuarios"), where("role", "==", "admin"), where("activo", "==", true));
        const snapAdmin = await getDocs(qAdmin);
        if (!snapAdmin.empty) {
          const docA = snapAdmin.docs[0];
          setUsuarioAdmin({ id: docA.id, ...docA.data() });
        } else {
          // fallback por correo conocido
          const qFb = query(collection(db, "usuarios"), where("correo", "==", "despachocontablefiscal374@gmail.com"));
          const fbSnap = await getDocs(qFb);
          if (!fbSnap.empty) {
            const docA = fbSnap.docs[0];
            setUsuarioAdmin({ id: docA.id, ...docA.data() });
          } else {
            setUsuarioAdmin(null);
          }
        }

        // 2) plantillas
        const snapPlant = await getDocs(collection(db, "plantillasCorreo"));
        setPlantillas(snapPlant.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3) clientes
        const snapCli = await getDocs(collection(db, "clientes"));
        setClientes(snapCli.docs.map(d => ({ id: d.id, ...d.data() })));

        // 4) pagos
        const snapPagos = await getDocs(collection(db, "pagos"));
        setPagos(snapPagos.docs.map(d => ({ id: d.id, ...d.data() })));

        setMessage(null);
      } catch (err) {
        console.error("Error cargando recordatorios:", err);
        setMessage({ type: "danger", text: "Error cargando datos. Revisa la consola." });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();

    return () => {
      mounted = false;
      if (autoRef.current) clearInterval(autoRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- util: aplicar plantilla ---------------- */
  const applyTemplate = (text = "", vars = {}) => {
    let out = text || "";
    Object.keys(vars).forEach(k => {
      const re = new RegExp(`{{\\s*${k}\\s*}}`, "gi");
      out = out.replace(re, vars[k] ?? "");
    });
    return out;
  };

  /* ---------------- acciones UI ---------------- */
  const handleViewTemplate = (t) => {
    // construir ejemplo dinámico usando primer cliente/pago si existe
    const ejemploCliente = clientes[0] || { nombre: "Cliente Ejemplo", email: "cliente@ejemplo.com" };
    const ejemploPago = pagos.find(p => p.clienteEmail === ejemploCliente.email) || {
      monto: 1200,
      fechaVencimiento: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split("T")[0],
      numeroFactura: "SC-PRUEBA-001",
      descripcion: "Servicios",
      fechaPago: ""
    };

    const hoy = new Date();
    const fechaVenc = parseDateFlexible(ejemploPago.fechaVencimiento);
    const diasDeAtraso =
      fechaVenc && hoy > fechaVenc
        ? daysDiff(fechaVenc, hoy)
        : 0;
    const pagoConAtraso = {
      ...ejemploPago,
      diasDeAtraso
    };
    const vars = {
      nombreDelCliente: ejemploCliente.nombre || "",
      cantidad: ejemploPago.monto ? `$${Number(ejemploPago.monto).toFixed(2)}` : "",
      fechaDeVencimiento: ejemploPago.fechaVencimiento || "",
      numeroDeFactura: ejemploPago.numeroFactura || "",
      descripcion: ejemploPago.descripcion || "",
      paidDate: ejemploPago.fechaPago || "",
      nombreDeEmpresa: usuarioAdmin?.nombreUsuario || "Mi Empresa",
      diasDeAtraso
    };

    const subject = applyTemplate(t.asunto || t.subject || "", vars);
    const body = applyTemplate(t.cuerpo || t.body || "", vars);

    setPreviewPayload({
      from: usuarioAdmin?.correo || usuarioAdmin?.email || "no-reply@empresa.com",
      to: ejemploCliente.email,
      subject,
      body,
      vars
    });
    setShowPreview(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate({ ...template });
    setShowEditModal(true);
  };

  const handleDelete = (template) => {
    setTemplateToDelete(template);
    setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      // marcaremos como inactiva (por seguridad)
      const tDoc = doc(db, "plantillasCorreo", templateToDelete.id);
      await updateDoc(tDoc, { activa: false });
      setPlantillas(plantillas.map(p => p.id === templateToDelete.id ? { ...p, activa: false } : p));
      setMessage({ type: "success", text: "Plantilla desactivada." });
    } catch (err) {
      if (err.code === "permission-denied") {
        setError("🚫 No tienes permisos para realizar esta acción.");
      }
      console.error("Eliminar plantilla:", err);
      setMessage({ type: "danger", text: "Error al desactivar la plantilla." });
    } finally {
      setShowConfirmDelete(false);
      setTemplateToDelete(null);
    }
  };

  const validateTemplate = (template) => {
    if (!template) return "No hay datos para guardar.";

    if (!template.nombre || template.nombre.trim().length < 3) {
      return "El nombre de la plantilla es obligatorio (mínimo 3 caracteres).";
    }

    if (!template.tipo) {
      return "Debes seleccionar un tipo de plantilla.";
    }

    if (!template.asunto || template.asunto.trim().length < 3) {
      return "El asunto es obligatorio.";
    }

    if (!template.cuerpo || template.cuerpo.trim().length < 10) {
      return "El cuerpo del correo no puede estar vacío.";
    }

    return null; // ✔ válido
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;

    // 🔒 Validación
    const errorMsg = validateTemplate(editingTemplate);
    if (errorMsg) {
      setMessage({ type: "danger", text: errorMsg });
      return;
    }

    try {
      if (editingTemplate.id) {
        const tRef = doc(db, "plantillasCorreo", editingTemplate.id);
        await updateDoc(tRef, {
          nombre: editingTemplate.nombre,
          tipo: editingTemplate.tipo,
          asunto: editingTemplate.asunto,
          cuerpo: editingTemplate.cuerpo,
          activa: !!editingTemplate.activa
        });
        setPlantillas(plantillas.map(p => p.id === editingTemplate.id ? { ...p, ...editingTemplate } : p));
      } else {
        const newRef = await addDoc(collection(db, "plantillasCorreo"), {
          nombre: editingTemplate.nombre || "Nueva plantilla",
          tipo: editingTemplate.tipo || "recordatorio",
          asunto: editingTemplate.asunto || "",
          cuerpo: editingTemplate.cuerpo || "",
          activa: true,
          creadoEn: new Date().toISOString()
        });
        setPlantillas([...plantillas, { id: newRef.id, ...editingTemplate }]);
      }
      setShowEditModal(false);
      setMessage({ type: "success", text: "Plantilla guardada." });
    } catch (err) {
      if (err.code === "permission-denied") {
        setError("🚫 No tienes permisos para realizar esta acción.");
      }
      console.error("saveTemplate:", err);
      setMessage({ type: "danger", text: "Error al guardar plantilla." });
    }
  };

  const enviarRecordatorio = async (pago) => {
    try {
      const response = await fetch(`${API_URL}/api/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoEnvio: "recordatorio",
          remitenteEmail: "despachocontablefiscal374@gmail.com",
          pago
        })
      });
      const data = await response.json();
      console.log("Resultado:", data);
    } catch (err) {
      console.error("Error enviando recordatorio:", err);
    }
  };


  /* ---------------- envío de prueba manual ---------------- */
  const handleSendTestEmail = async () => {
    if (!usuarioAdmin) {
      setMessage({ type: "danger", text: "No se ha configurado un remitente admin activo." });
      return;
    }
    const plantilla = plantillas[0];
    const cliente = clientes[0] || { nombre: "Cliente Prueba", email: "margaritogeraldin@gmail.com" };
    if (!plantilla) {
      setMessage({ type: "danger", text: "No hay plantillas definidas." });
      return;
    }

    try {
      const payload = {
        tipoEnvio: "recordatorio",
        remitenteEmail: "despachocontablefiscal374@gmail.com",
        pago: {
          clienteEmail: "margaritogeraldin@gmail.com",
          clienteNombre: "Juan Pérez prueba",
          monto: 1200,
          fechaVencimiento: "2025-11-15",
          numeroFactura: "FAC-105",
          descripcion: "Servicio contable mensual desde front"
        }
      };

      const res = await fetch(`${API_URL}/api/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Error al enviar correo");
      }
      setMessage({ type: "success", text: json.message || "Correo de prueba enviado." });
    } catch (err) {
      console.error("Error test send:", err);
      setMessage({ type: "danger", text: err.message || "Error enviando correo de prueba." });
    }
  };

  /* ---------------- Automatización (frontend) ----------------
     - Recorre la colección pagos y decide si enviar:
       * 3 días antes -> tipo recordatorio
       * 2 días después -> tipo aviso
       * cuando existe fechaPago -> confirmacion (si no existe registr. previo)
     - Envía POST a /api/send-reminder para que el backend con nodemailer envíe el correo.
     - Nota: idealmente esta automatización debe estar en backend cron/cloud function.
  */
  useEffect(() => {
    if (!loadingAdmin && adminEmail) {
      automaticCheckAndSend();
    } else if (!loadingAdmin && !adminEmail) {
      console.warn("No admin configured - skipping automatic check");
    }
  }, [loadingAdmin, adminEmail]);
  async function automaticCheckAndSend() {
    if (!usuarioAdmin) {
      console.warn("No admin configured - skipping automatic check");
      return;
    }
    try {
      // recargar plantillas y pagos desde DB (último estado)
      const snapPlant = await getDocs(collection(db, "plantillasCorreo"));
      const currentPlantillas = snapPlant.docs.map(d => ({ id: d.id, ...d.data() }));
      const snapPag = await getDocs(collection(db, "pagos"));
      const pagosList = snapPag.docs.map(d => ({ id: d.id, ...d.data() }));

      const hoy = new Date();
      const fechaVenc = parseDateFlexible(pago.fechaVencimiento);

      const diasDeAtraso =
        fechaVenc && hoy > fechaVenc
          ? daysDiff(fechaVenc, hoy)
          : 0;

      const pagoConAtraso = {
        ...pago,
        diasDeAtraso
      };

      for (const pago of pagosList) {
        if (!pago.clienteEmail || !pago.fechaVencimiento) continue;
        const fechaVenc = parseDateFlexible(pago.fechaVencimiento);
        if (!fechaVenc) continue;

        const diasParaVenc = daysDiff(hoy, fechaVenc); // hoy -> vencimiento
        const diasDespues = daysDiff(fechaVenc, hoy); // vencimiento -> hoy

        // 1) recordatorio 3 dias antes
        if (diasParaVenc === 3) {
          const plantilla = currentPlantillas.find(p => p.tipo === "recordatorio") || currentPlantillas.find(p => (p.nombre || "").toLowerCase().includes("3"));
          if (plantilla && plantilla.activa) {
            await callSendEndpoint({ tipoEnvio: "recordatorio", remitenteId: usuarioAdmin.id, remitenteEmail: usuarioAdmin.correo || usuarioAdmin.email, plantillaId: plantilla.id, pago });
          }
        }

        // 2) aviso 2 dias despues
        if (diasDespues === 2) {
          const plantilla = currentPlantillas.find(p => p.tipo === "aviso") || currentPlantillas.find(p => (p.nombre || "").toLowerCase().includes("venc"));
          if (plantilla && plantilla.activa) {
            await callSendEndpoint({ tipoEnvio: "aviso", remitenteId: usuarioAdmin.id, remitenteEmail: usuarioAdmin.correo || usuarioAdmin.email, plantillaId: plantilla.id, pago: pagoConAtraso });
          }
        }

        // 3) confirmacion de pago si fechaPago existe y no se ha registrado confirmacion
        if (pago.fechaPago) {
          // preguntar historial para evitar duplicados (backend haría mejor esta validación, pero hacemos una petición)
          // En este frontend solo lanzamos la petición; backend hará control final.
          const plantilla = currentPlantillas.find(p => p.tipo === "confirmacion") || currentPlantillas.find(p => (p.nombre || "").toLowerCase().includes("confirm"));
          if (plantilla && plantilla.activa) {
            await callSendEndpoint({ tipoEnvio: "confirmacion", remitenteId: usuarioAdmin.id, remitenteEmail: usuarioAdmin.correo || usuarioAdmin.email, plantillaId: plantilla.id, pago });
          }
        }
      }
    } catch (err) {
      console.error("automaticCheckAndSend error:", err);
    }
  }

  async function callSendEndpoint(body) {
    try {
      const res = await fetch(`${API_URL}/api/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const text = await res.text(); // ⬅️ NO json()
        console.error("send endpoint error:", res.status, text);
        return;
      }

      const json = await res.json();
      console.log("send endpoint OK", json);

    } catch (err) {
      console.error("callSendEndpoint error:", err);
    }
  }

  /* ---------------- filtrado y paginación ---------------- */
  const filtered = plantillas.filter(p => {
    return (
      search === "" ||
      (p.nombre || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.asunto || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.tipo || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filtered.length / entriesPerPage) || 1;
  const idxLast = currentPage * entriesPerPage;
  const idxFirst = idxLast - entriesPerPage;
  const currentRows = filtered.slice(idxFirst, idxLast);

  const loadHistorial = async () => {
    try {
      setLoadingHistorial(true);
      const qHist = query(
        collection(db, "historialCorreos"),
        orderBy("creadoEn", "desc")
      );
      const snap = await getDocs(qHist);

      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          creadoEn: data.creadoEn?.toDate
            ? data.creadoEn.toDate()
            : null
        };
      });

      setHistorial(list);
    } catch (err) {
      console.error("Error cargando historial:", err);
    } finally {
      setLoadingHistorial(false);
    }
  };

  const descargarHistorialExcel = () => {
    if (historial.length === 0) return;

    const data = historial.map(h => ({
      Cliente: h.clienteNombre,
      Email: h.clienteEmail,
      Tipo: h.tipo,
      Asunto: h.asunto,
      Fecha: h.creadoEn ? new Date(h.creadoEn).toLocaleString() : "",
      Estado: h.mensajeNodemailer?.accepted?.length > 0 ? "Enviado" : "Error"
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HistorialCorreos");

    XLSX.writeFile(wb, "historial_correos.xlsx");
  };

  /* ---------------- render ---------------- */
  return (
    <>
      <Navbar />
      <Container fluid className="bg-light min-vh-100 p-4">
        <header className="d-flex justify-content-between align-items-center mb-4">
          <div className="d-flex align-items-center gap-3">
            <Button variant="outline-secondary" onClick={() => navigate("/dashboard")}>
              <ArrowLeft size={18} /> Volver
            </Button>
            <div>
              <h2 className="fw-bold">Recordatorios y Notificaciones</h2>
              <p className="text-muted">Gestiona plantillas, envíos y configuración de notificaciones</p>
            </div>
          </div>

          <div className="d-flex gap-2">
            {/* 
            <Button variant="outline-dark" className="d-flex align-items-center gap-2" onClick={() => alert("Abrir configuración (implementar)")}>
              <Clock size={16} /> Configuración
            </Button>
            
            <Button variant="outline-primary" className="d-flex align-items-center gap-2" onClick={handleSendTestEmail}>
              <Mail size={16} /> Enviar correo electrónico de prueba
            </Button>
            */}
            <Button variant="outline-secondary" className="d-flex align-items-center gap-2"
              onClick={() => {
                setHistorialSearch("");     // 🔥 limpia búsqueda
                setHistorialPage(1);        // 🔥 vuelve a la primera página
                loadHistorial();
                setShowHistorialModal(true);
              }}
            >
              <Download size={16} /> Historial de correos
            </Button>
            <Button variant="dark" className="d-flex align-items-center gap-2" onClick={() => { setEditingTemplate({ nombre: "", tipo: "recordatorio", asunto: "", cuerpo: "", activa: true }); setShowEditModal(true); }}>
              <Plus size={16} /> Nueva plantilla
            </Button>
          </div>
        </header>

        {message && (
          <div className={`alert alert-${message.type} py-2`} role="alert">{message.text}</div>
        )}

        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <Row className="align-items-center">
            <Col md={6}>
              <Form.Control placeholder="Buscar plantillas..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
            </Col>
            <Col md={6} className="text-end">
              <small className="text-muted">Mostrando {idxFirst + 1} - {Math.min(idxLast, filtered.length)} de {filtered.length}</small>
            </Col>
          </Row>
        </div>

        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <Table hover responsive className="align-middle">
            <thead className="table-success">
              <tr>
                <th>Plantilla</th>
                <th>Tipo</th>
                <th>Asunto</th>
                <th>Estado</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted py-4">No hay plantillas.</td></tr>
              ) : (
                currentRows.map(t => (
                  <tr key={t.id}>
                    <td>{t.nombre}</td>
                    <td><Badge bg="secondary">{t.tipo || "general"}</Badge></td>
                    <td style={{ maxWidth: 420 }} className="text-truncate">{t.asunto}</td>
                    <td><Badge bg={t.activa ? "success" : "secondary"}>{t.activa ? "Activo" : "Inactivo"}</Badge></td>
                    <td className="text-center">
                      <div className="d-flex justify-content-center gap-2">
                        <Button variant="outline-success" size="sm" onClick={() => handleViewTemplate(t)}>
                          <Eye size={14} />
                        </Button>
                        <Button variant="outline-primary" size="sm" onClick={() => handleEdit(t)}>
                          <Edit size={14} />
                        </Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handleDelete(t)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <div>
              <Form.Select style={{ width: 90 }} value={entriesPerPage} onChange={(e) => { setEntriesPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                <option>5</option>
                <option>10</option>
                <option>25</option>
              </Form.Select>
            </div>
            <div className="d-flex gap-2">
              <Button size="sm" variant="outline-success" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Anterior</Button>
              <span className="align-self-center fw-semibold text-success">{currentPage} / {totalPages}</span>
              <Button size="sm" variant="outline-success" disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Siguiente</Button>
            </div>
          </div>
        </div>
      </Container>

      {/* Modal: Vista previa */}
      <Modal show={showPreview} onHide={() => setShowPreview(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Vista previa de correo</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {previewPayload ? (
            <>
              <div><strong>Desde:</strong> {previewPayload.from}</div>
              <div><strong>Para:</strong> {previewPayload.to}</div>
              <div className="mt-2"><strong>Asunto:</strong> {previewPayload.subject}</div>

              <div className="card mt-3">
                <div className="card-body" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{previewPayload.body}</div>
              </div>

              <div className="card mt-3">
                <div className="card-body">
                  <h6>Variables</h6>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(previewPayload.vars, null, 2)}</pre>
                </div>
              </div>
            </>
          ) : <div className="text-center"><Spinner animation="border" /></div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPreview(false)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>

      <Offcanvas
        show={showEditModal}
        onHide={() => setShowEditModal(false)}
        placement="end"
        backdrop="static"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>
            {editingTemplate?.id ? "Editar Plantilla" : "Nueva Plantilla"}
          </Offcanvas.Title>
        </Offcanvas.Header>

        <Offcanvas.Body>
          {/* inputs */}
          {editingTemplate ? (
            <Form>
              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label>Nombre</Form.Label>
                  <Form.Control value={editingTemplate.nombre || ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, nombre: e.target.value })} />
                </Col>
                <Col md={6}>
                  <Form.Label>Tipo</Form.Label>
                  <Form.Select value={editingTemplate.tipo || "recordatorio"} onChange={(e) => setEditingTemplate({ ...editingTemplate, tipo: e.target.value })}>
                    <option value="recordatorio">Recordatorio de pago</option>
                    <option value="aviso">Aviso de vencimiento</option>
                    <option value="confirmacion">Confirmación de pago</option>
                  </Form.Select>
                </Col>
              </Row>

              <Form.Group className="mb-3">
                <Form.Label>Asunto</Form.Label>
                <Form.Control value={editingTemplate.asunto || ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, asunto: e.target.value })} />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Cuerpo (usa variables tipo <code>{"{{nombreDelCliente}}"}</code>)</Form.Label>
                <Form.Control as="textarea" rows={10} value={editingTemplate.cuerpo || ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, cuerpo: e.target.value })} />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Estado</Form.Label>
                <Form.Check type="switch" label="Activa" checked={!!editingTemplate.activa} onChange={(e) => setEditingTemplate({ ...editingTemplate, activa: e.target.checked })} />
              </Form.Group>

              <div className="mb-2">
                <small className="text-muted">Variables disponibles:</small>
                <div className="d-flex gap-2 flex-wrap mt-2">
                  {["nombreDelCliente", "cantidad", "fechaDeVencimiento", "numeroDeFactura", "descripcion", "diasDeAtraso", "paidDate", "nombreDeEmpresa"].map(v => (
                    <Button key={v} variant="outline-secondary" size="sm" onClick={() => {
                      setEditingTemplate(prev => ({ ...prev, cuerpo: (prev.cuerpo || "") + (prev.cuerpo ? "\n\n" : "") + `{{${v}}}` }));
                    }}>{`{{${v}}}`}</Button>
                  ))}
                </div>
              </div>
            </Form>
          ) : <div className="text-center"><Spinner animation="border" /></div>}
          <div className="d-grid gap-2 mt-3">
            <Button variant="outline-secondary" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button
              variant="success"
              onClick={saveTemplate}
              disabled={
                !editingTemplate?.nombre ||
                !editingTemplate?.asunto ||
                !editingTemplate?.cuerpo
              }
            >
              Guardar
            </Button>
          </div>
        </Offcanvas.Body>
      </Offcanvas>


      

      {/* Modal: Confirm delete (marca inactivo) */}
      <Modal show={showConfirmDelete} onHide={() => setShowConfirmDelete(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          ¿Deseas desactivar la plantilla <strong>{templateToDelete?.nombre}</strong>?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirmDelete(false)}>Cancelar</Button>
          <Button variant="danger" onClick={confirmDelete}>Desactivar</Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: Historial de Correos */}
      <Modal show={showHistorialModal} onHide={() => setShowHistorialModal(false)} size="xl" centered>
        <Modal.Header closeButton>
          <Modal.Title>Historial de correos enviados</Modal.Title>
        </Modal.Header>
        <Row className="bg-white p-3 rounded shadow-sm mb-4">
          <Col md={8}>
            <Form.Control
              placeholder="Buscar por cliente, correo, asunto o tipo..."
              className="mb-3"
              value={historialSearch}
              onChange={(e) => { setHistorialSearch(e.target.value); setHistorialPage(1); }}
            />
          </Col>

          <Col md={2}>
            <Button
              variant="outline-success"
              size="sm"
              onClick={descargarHistorialExcel}
            >
              Descargar historial
            </Button>
          </Col>

          <Col md={2}>
            {usuarioAdmin?.role === "admin" && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setShowConfirmVaciarHistorial(true)}
              >
                Vaciar historial
              </Button>
            )}
          </Col>
        </Row>

        <Modal.Body>
          {loadingHistorial ? (
            <div className="text-center py-4">
              <Spinner animation="border" />
            </div>
          ) : (
            <>
              

              {/* Filtrado */}
              {(() => {
                const filtered = historial.filter(h =>
                  historialSearch === "" ||
                  (h.clienteNombre || "").toLowerCase().includes(historialSearch.toLowerCase()) ||
                  (h.clienteEmail || "").toLowerCase().includes(historialSearch.toLowerCase()) ||
                  (h.tipo || "").toLowerCase().includes(historialSearch.toLowerCase()) ||
                  (h.asunto || "").toLowerCase().includes(historialSearch.toLowerCase())
                );

                const totalPages = Math.ceil(filtered.length / historialPerPage) || 1;
                const lastIdx = historialPage * historialPerPage;
                const firstIdx = lastIdx - historialPerPage;
                const rows = filtered.slice(firstIdx, lastIdx);

                return (
                  <>
                    <div className="d-flex justify-content-between mb-2">
                      <div><small className="text-muted">Mostrando {firstIdx + 1} - {Math.min(lastIdx, filtered.length)} de {filtered.length}</small></div>
                      <Form.Select style={{ width: 90 }} value={historialPerPage} onChange={(e) => { setHistorialPerPage(Number(e.target.value)); setHistorialPage(1); }}>
                        <option>5</option>
                        <option>10</option>
                        <option>25</option>
                      </Form.Select>
                    </div>

                    <Table hover responsive>
                      <thead className="table-success">
                        <tr>
                          <th>Cliente</th>
                          <th>Email</th>
                          <th>Tipo</th>
                          <th>Asunto</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th className="text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td colSpan="7" className="text-center py-4 text-muted">No hay registros.</td></tr>
                        ) : rows.map(h => (
                          <tr key={h.id}>
                            <td>{h.clienteNombre}</td>
                            <td>{h.clienteEmail}</td>
                            <td><Badge bg="secondary">{h.tipo}</Badge></td>
                            <td className="text-truncate" style={{ maxWidth: 300 }}>{h.asunto}</td>
                            <td>{h.creadoEn?.toLocaleString()}</td>
                            <td>
                              <Badge bg={h.accepted?.length > 0 ? "success" : "danger"}>
                                {h.mensajeNodemailer?.accepted?.length > 0 ? "Enviado" : "Error"}
                              </Badge>
                            </td>
                            <td className="text-center">
                              <Button variant="outline-primary" size="sm" onClick={() => {
                                setDetalleCorreo(h);
                                setShowDetalleCorreo(true);
                              }}>
                                <Eye size={14} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>

                    <div className="d-flex justify-content-between">
                      <Button size="sm" variant="outline-success" disabled={historialPage === 1} onClick={() => setHistorialPage(historialPage - 1)}>Anterior</Button>
                      <span className="fw-semibold text-success">{historialPage} / {totalPages}</span>
                      <Button size="sm" variant="outline-success" disabled={historialPage === totalPages} onClick={() => setHistorialPage(historialPage + 1)}>Siguiente</Button>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Modal: Detalle del correo */}
      <Modal show={showDetalleCorreo} onHide={() => setShowDetalleCorreo(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Detalle del correo</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!detalleCorreo ? (
            <div className="text-center"><Spinner animation="border" /></div>
          ) : (
            <>
              <p><strong>Cliente:</strong> {detalleCorreo.clienteNombre}</p>
              <p><strong>Email:</strong> {detalleCorreo.clienteEmail}</p>
              <p><strong>Tipo:</strong> {detalleCorreo.tipo}</p>
              <p><strong>Asunto:</strong> {detalleCorreo.asunto}</p>
              <p><strong>Fecha:</strong> {new Date(detalleCorreo.creadoEn).toLocaleString()}</p>

              <div className="card mt-3">
                <div className="card-body">
                  <h6>Cuerpo del correo</h6>
                  <div
                    className="correo-cuerpo"
                    dangerouslySetInnerHTML={{ __html: detalleCorreo.cuerpo }}
                  />
                </div>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetalleCorreo(false)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showConfirmVaciarHistorial}
        onHide={() => setShowConfirmVaciarHistorial(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirmar acción</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          ⚠️ Esta acción eliminará <strong>todo el historial de correos</strong>.
          <br />
          Esta acción no se puede deshacer.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirmVaciarHistorial(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={vaciarHistorial}>
            Vaciar historial
          </Button>
        </Modal.Footer>
      </Modal>

    </>
  );
}
