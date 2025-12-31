import React, { useEffect, useState, useRef } from "react";
import { Container, Row, Col, Card, Button, Form, Table, Badge, Toast, ToastContainer, Modal, Offcanvas, InputGroup, ListGroup, Alert } from "react-bootstrap";
import { Download, Plus, Eye, Edit, Trash2, FileText, CreditCard, Calendar, History } from "lucide-react";
import Navbar from "./Navbar";
import { db } from "../firebaseConfig";
import { collection, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, Timestamp } from "firebase/firestore";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../assets/logo.png";
import { useLocation } from "react-router-dom";
import { useError } from "../context/ErrorContext";
import { toast } from "react-toastify";

export default function Pagos() {
  //FISTROS PARA EL DASHBOARD
  const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, "");
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const filtro = queryParams.get("filtro");
  const inputRef = useRef(null);

  useEffect(() => {
    if (filtro === "pendientes") {
      setStatusFilter("Pendiente");
    } else if (filtro === "vencido") {
      setStatusFilter("Vencido");
    } else if (filtro === "mes") {
      const hoy = new Date();
      const mesActual = hoy.toISOString().slice(0, 7);
      setMonthFilter(mesActual);
    } else {
      setStatusFilter("Todos los estatus");
    }
  }, [filtro]);

  // Manejar clic en tarjeta de estadísticas
  const handleStatClick = (tipo) => {
    switch (tipo) {
      case "pagado":
        setStatusFilter("Pagado");
        break;
      case "pendiente":
        setStatusFilter("Pendiente");
        break;
      case "vencido":
        setStatusFilter("Vencido"); // o "Vencido", según como los guardes
        break;
      default:
        setStatusFilter("Todos los estatus");
        break;
    }

    // Reinicia la página al 1 para que no quede en una paginación vieja
    setCurrentPage(1);
  };

  // --------------------------
  // Estados principales
  // --------------------------
  const [clientes, setClientes] = useState([]); // todos los clientes
  const [pagos, setPagos] = useState([]);

  // filtros / búsqueda / paginación
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos los estatus");
  const [monthFilter, setMonthFilter] = useState("");
  const [regimenFilter, setRegimenFilter] = useState("Todos los regímenes");
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // obtener los clientes activos
  const clientesActivos = clientes.filter((c) =>
    (c.estado || c.estado === undefined ? (c.estado || "Activo") : c.estado)
      .toString()
      .toLowerCase() === "activo"
  );

  // modal / form
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportFilter, setExportFilter] = useState("todos");

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPago, setEditingPago] = useState(null); // si tiene valor -> estamos editando
  const [originalStatus, setOriginalStatus] = useState(null); // para bloquear cambios si original fue "Pagado"
  const [statusLocked, setStatusLocked] = useState(false); // bloqueo del select de estado

  const [showViewModal, setShowViewModal] = useState(false);
  const [viewPago, setViewPago] = useState(null);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [pagoToDelete, setPagoToDelete] = useState(null);

  const [message, setMessage] = useState(null);
  const { setError } = useError();
  const [toastError, setToastError] = useState("");
  const [showDeleteInfo, setShowDeleteInfo] = useState(false);

  // alert duplicado dentro del modal
  const [duplicateAlert, setDuplicateAlert] = useState(""); // mensaje de error cuando existe pago en mismo mes

  // mostrar los pagos (o clientes) del mes actual o de otro mes
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const fecha = new Date();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const anio = fecha.getFullYear();
    return `${anio}-${mes}`; // formato YYYY-MM
  });

  const verde = "#4caf50";

  // formulario registrar/editar (estado)
  const initialForm = {
    clienteId: "",
    monto: "",
    numeroFactura: "",
    fechaVencimiento: "",
    fechaPago: "",
    estatus: "Pendiente",
    metodoPago: "",
    periocidad: "Mensual",
    descripcion: "",
  };
  const [formData, setFormData] = useState(initialForm);

  // autocompletado clientes (texto)
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteSuggestions, setClienteSuggestions] = useState([]);
  const suggestionsRef = useRef(null);

  // flag para generación inicial de pagos (evitar múltiple ejecución)
  const generatedInitialRef = useRef(false);

  // ---------------------------
  // Historial modal state
  // ---------------------------
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyClient, setHistoryClient] = useState(null);
  const [historyPayments, setHistoryPayments] = useState([]);

  const handleGuardar = () => {
    if (!usuarioAdmin || usuarioAdmin.role !== "admin") {
      setError("No tienes permisos para realizar esta acción.");
      return;
    }
  };

  // ---------------------------------------
  // Cargar clientes y pagos (real-time desde Firestore)
  // ---------------------------------------
  useEffect(() => {
    const clientesRef = collection(db, "clientes");
    const unsubClientes = onSnapshot(clientesRef, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setClientes(arr);
    });

    const pagosRef = collection(db, "pagos");
    const unsubPagos = onSnapshot(pagosRef, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPagos(arr);
    });

    // Para pagos atrasados — observador que marca atrasados
    const unsubAtrasos = onSnapshot(pagosRef, async (snapshot) => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const pagoId = docSnap.id;

        // ⛔ Nunca tocar pagos pagados
        if ((data.estatus || "").toLowerCase() === "pagado") continue;
        if (!data.fechaVencimiento) continue;

        let fechaVenc = null;

        if (data.fechaVencimiento instanceof Date) {
          fechaVenc = data.fechaVencimiento;
        } else if (typeof data.fechaVencimiento === "string") {
          fechaVenc = new Date(data.fechaVencimiento);
        } else if (data.fechaVencimiento?.seconds) {
          fechaVenc = new Date(data.fechaVencimiento.seconds * 1000);
        }

        if (!fechaVenc || isNaN(fechaVenc)) continue;
        fechaVenc.setHours(0, 0, 0, 0);

        // Fecha límite = vencimiento + 3 días
        const fechaLimite = new Date(fechaVenc);
        fechaLimite.setDate(fechaLimite.getDate() + 3);

        const estaVencido = hoy > fechaLimite;

        // 🔁 CAMBIO DE ESTADO SOLO SI ES NECESARIO
        if (estaVencido && data.estatus !== "Vencido") {
          await updateDoc(doc(db, "pagos", pagoId), { estatus: "Vencido" });
        }

        if (!estaVencido && data.estatus === "Vencido") {
          await updateDoc(doc(db, "pagos", pagoId), { estatus: "Pendiente" });
        }
      }
    });

    return () => {
      unsubClientes();
      unsubPagos();
      unsubAtrasos();
    };
  }, []);

  // ---------------------------------------
  // Utilidades
  // ---------------------------------------
  const formatCurrency = (v) => {
    const n = Number(v || 0);
    return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  };

  const parseDateForInput = (v) => {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      if (/^\d{2}\/\d{2}\/\d{4}/.test(v)) {
        const [dd, mm, yyyy] = v.split("/");
        return `${yyyy}-${mm}-${dd}`;
      }
      return new Date(v).toISOString().slice(0, 10);
    }
    if (v.seconds) return new Date(v.seconds * 1000).toISOString().slice(0, 10);
    return "";
  };

  const todayYYYYMMDD = () => {
    return new Date().toISOString().slice(0, 10);
  };

  // función para calcular fecha de vencimiento automática:
  const calcularFechaVencimientoAuto = () => {
    const hoy = new Date();
    const dia = hoy.getDate();
    let year = hoy.getFullYear();
    let month = hoy.getMonth(); // 0-indexed

    // Si ya pasó el día 17, generar para el siguiente mes
    if (dia > 17) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    const mm = String(month + 1).padStart(2, "0");
    const dd = "17";
    return `${year}-${mm}-${dd}`;
  };

  // Obtener cliente por id
  const getClientById = (id) => clientes.find((c) => c.id === id) || null;

  // Mostrar nombre + email
  const getClientDisplay = (id) => {
    const c = getClientById(id);
    return c ? `${c.nombre}${c.email ? " - " + c.email : ""}` : "Cliente no encontrado";
  };

  // ---------------------------------------
  // Generar prefijo numero factura según régimen
  // ---------------------------------------
  const normalizar = (texto) =>
    texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const regimenPrefix = (regimen) => {
    if (!regimen) return "XX";
    const r = normalizar(regimen);
    if (r.includes("actividad") || r.includes("empresarial")) return "AE";
    if (r.includes("simplificado") || r.includes("confianza")) return "SC";
    if (r.includes("plataforma") || r.includes("digital")) return "PD";
    if (r.includes("arrendamiento")) return "AR";
    if (r.includes("agape")) return "AG";
    if (r.includes("incorporacion") || r.includes("fiscal")) return "IF";
    if (r.includes("persona") || r.includes("moral")) return "PM";
    if (r.includes("regimen general")) return "RG";
    return "XX";
  };

  // 🔹 versión que usa los pagos ya cargados del estado (para manuales)
  const generarNumeroFacturaManual = (clienteId) => {
    const cliente = getClientById(clienteId);
    if (!cliente) return "XX00";
    const regimen = cliente.regimenFiscal || "";
    const prefix = regimenPrefix(regimen);

    const usados = pagos
      .filter((p) => p.numeroFactura?.startsWith(prefix))
      .map((p) => parseInt(p.numeroFactura.replace(/\D/g, "")) || 0);

    const next = (Math.max(0, ...usados) || 0) + 1;
    return `${prefix}${String(next).padStart(2, "0")}`;
  };

  // 🔹 versión para generación automática (usa snapshot Firestore)
  const generarNumeroFacturaAuto = (cliente, pagosExistentes) => {
    const regimen = cliente?.regimenFiscal || "";
    const prefix = regimenPrefix(regimen);

    const usados = pagosExistentes
      .filter((p) => p.numeroFactura?.startsWith(prefix))
      .map((p) => parseInt(p.numeroFactura.replace(/\D/g, "")) || 0);

    const next = (Math.max(0, ...usados) || 0) + 1;
    return `${prefix}${String(next).padStart(2, "0")}`;
  };

  //*--------------------------------
  // GENERAR REGISTROS DE PAGOS AL INICIO DE MES
  //------------------
  const generadoRef = useRef(false);
  useEffect(() => {
    const generarPagosDelMes = async () => {
      if (generadoRef.current) return; // ✅ evita doble ejecución total
      generadoRef.current = true;

      const hoy = new Date();
      const mesActual = hoy.toISOString().slice(0, 7); // "YYYY-MM"
      const fechaVencimiento = `${mesActual}-17`;

      // 1️⃣ Obtener clientes activos primero
      const qPagos = query(
        collection(db, "pagos"),
        where("archivado", "!=", true)
      );
      const snapPagos = await getDocs(qPagos);
      const clientesRef = collection(db, "clientes");
      const clientesSnapshot = await getDocs(clientesRef);
      const clientesActivos = clientesSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((c) => c.estado?.toLowerCase() === "activo");

      //console.log("🟢 Clientes activos:", clientesActivos.length);

      // 2️⃣ Obtener todos los pagos existentes
      const pagosRef = collection(db, "pagos");
      const pagosSnapshot = await getDocs(pagosRef);
      const pagosExistentes = pagosSnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // 3️⃣ Recorrer cada cliente activo y crear pago si no tiene del mes
      for (const cliente of clientesActivos) {
        const yaTienePago = pagosExistentes.some(
          (p) => p.clienteId === cliente.id && p.mes === mesActual
        );
        if (yaTienePago) continue;

        const numeroFactura = generarNumeroFacturaAuto(cliente, pagosExistentes);

        const nuevoPago = {
          clienteId: cliente.id,
          numeroFactura,
          mes: mesActual,
          estatus: "Pendiente",
          fechaVencimiento,
          fechaPago: "",
          metodoPago: "",
          descripcion: "",
          monto: cliente.montoMensual || 0,
          creadoAutomaticamente: true,
        };

        await addDoc(pagosRef, nuevoPago);
        pagosExistentes.push(nuevoPago);
        //console.log(`✅ Pago generado para ${cliente.nombre} (${numeroFactura})`);
      }

      console.log("🟩 Pagos del mes creados exitosamente.");
    };

    generarPagosDelMes();
  }, []);
  // ---------------------------------------
  // Filtrado y paginación (ajustado a requisitos)
  // ---------------------------------------
  const mesActual = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  //const filteredPagos = pagos
  const filteredPagos = pagos
    .map((p) => {
      const cliente = getClientById(p.clienteId) || {};
      return {
        ...p,
        clienteNombre: p.clienteNombre || cliente.nombre || "Cliente no encontrado",
        clienteEmail: p.clienteEmail || cliente.email || "",
        clienteRegimen: p.clienteRegimen || cliente.regimenFiscal || "",
      };
    })
    .filter((p) => {
      // Excluir pagos cuyo cliente no esté Activo
      const cliente = getClientById(p.clienteId);
      if (!cliente || (cliente.estado || "").toLowerCase() !== "activo") return false;

      // búsqueda
      const term = search.trim().toLowerCase();
      if (term) {
        const inCliente = (p.clienteNombre || "").toLowerCase().includes(term);
        const inEmail = (p.clienteEmail || "").toLowerCase().includes(term);
        const inFactura = (p.numeroFactura || "").toLowerCase().includes(term);
        const inNotas = (p.descripcion || "").toLowerCase().includes(term);
        if (!(inCliente || inEmail || inFactura || inNotas)) return false;
      }

      // estatus
      if (statusFilter !== "Todos los estatus" && p.estatus !== statusFilter) return false;

      // mes (YYYY-MM) --- se toma de p.mes
      if (monthFilter) {
        if (!p.mes) return false;
        if (!p.mes.startsWith(monthFilter)) return false;
      }

      // regimen fiscal
      if (regimenFilter !== "Todos los regímenes" && (p.clienteRegimen || "") !== regimenFilter) return false;

      // Mostrar solo los pagos del mes actual (por defecto)
      if (!monthFilter && p.mes !== mesActual) return false;

      return true;
    })
    .sort((a, b) => {
      const aDate = a.fechaVencimiento ? new Date(parseDateForInput(a.fechaVencimiento)) : null;
      const bDate = b.fechaVencimiento ? new Date(parseDateForInput(b.fechaVencimiento)) : null;
      if (aDate && bDate) return aDate - bDate;
      if (aDate) return -1;
      if (bDate) return 1;
      return 0;
    });

  const totalPages = Math.ceil(filteredPagos.length / entriesPerPage) || 1;
  const indexOfLast = currentPage * entriesPerPage;
  const indexOfFirst = indexOfLast - entriesPerPage;
  const currentPagos = filteredPagos.slice(indexOfFirst, indexOfLast);

  // ---------------------------------------
  // Estadísticas en tiempo real pagos
  // ---------------------------------------
  const [anioSeleccionado, mesSeleccionadoNum] = mesSeleccionado
    .split("-")
    .map(Number);

  const mesIndex = mesSeleccionadoNum - 1;

  const stats = React.useMemo(() => {
    let totalMonto = 0;
    let pagosPagados = 0;
    let pagosPendientes = 0;
    let pagosVencidos = 0;

    filteredPagos.forEach((p) => {
      const monto = Number(p.monto) || 0;
      const est = (p.estatus || "").toLowerCase();

      totalMonto += monto;

      if (est === "pagado") pagosPagados++;
      if (est === "pendiente") pagosPendientes++;
      if (est === "vencido") pagosVencidos++;
    });

    return {
      totalMonto,
      totalRegistros: filteredPagos.length,
      pagosPagados,
      pagosPendientes,
      pagosVencidos,
    };
  }, [filteredPagos]);

  // ---------------------------------------
  // CRUD / Form handling
  // ---------------------------------------

  // abrir modal nuevo pago
  const openNewPagoModal = () => {
    setEditingPago(null);
    setOriginalStatus(null);
    setStatusLocked(false);
    const fechaVencimientoAuto = calcularFechaVencimientoAuto();

    setFormData({
      ...initialForm,
      fechaVencimiento: fechaVencimientoAuto,
      fechaPago: "",
      numeroFactura: "",
    });

    setClienteQuery("");
    setClienteSuggestions([]);
    setDuplicateAlert("");
    setShowFormModal(true);
  };

  // abrir modal editar pago
  const openEditPagoModal = (pago) => {
    setEditingPago(pago);
    setOriginalStatus(pago.estatus || pago.estado || null);
    const locked = ((pago.estatus || pago.estado || "").toString().toLowerCase() === "pagado");
    setStatusLocked(locked);

    setFormData({
      clienteId: pago.clienteId || "",
      monto: pago.monto || 0,
      numeroFactura: pago.numeroFactura || "",
      fechaVencimiento: parseDateForInput(pago.fechaVencimiento),
      fechaPago: parseDateForInput(pago.fechaPago),
      estatus: pago.estatus || pago.estado || "Pendiente",
      metodoPago: pago.metodoPago || "",
      periocidad: pago.periocidad || "Mensual",
      descripcion: pago.descripcion || "",
    });

    // cargar texto del cliente en autocompletado
    const cliente = getClientById(pago.clienteId);
    setClienteQuery(cliente ? `${cliente.nombre}` : "");
    setClienteSuggestions([]);
    setDuplicateAlert("");
    setShowFormModal(true);
  };

  // Autocompletado: filtra clientes activos por nombre o email
  useEffect(() => {
    // 🚫 NO mostrar sugerencias si estamos editando un pago
    if (editingPago) {
      setClienteSuggestions([]);
      return;
    }

    if (!clienteQuery || clienteQuery.trim() === "") {
      setClienteSuggestions([]);
      return;
    }
    const q = clienteQuery.trim().toLowerCase();
    const matches = clientes
      .filter((c) => (c.estado || "").toLowerCase() === "activo")
      .filter((c) => {
        const hayNombre = (c.nombre || "").toLowerCase().includes(q);
        const hayEmail = ("").toLowerCase().includes(q);
        return hayNombre || hayEmail;
      })
      .slice(0, 8);
    setClienteSuggestions(matches);
  }, [clienteQuery, clientes]);

  useEffect(() => {
    if (clienteSuggestions.length > 0 && suggestionsRef.current && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();

      suggestionsRef.current.style.top = `${rect.bottom + 4}px`;
      suggestionsRef.current.style.left = `${rect.left}px`;
      suggestionsRef.current.style.width = `${rect.width}px`;
    }
  }, [clienteSuggestions]);

  // detectar clicks fuera del panel de sugerencias para cerrarlo
  useEffect(() => {
    const onDocClick = (e) => {
      if (!suggestionsRef.current) return;
      if (!suggestionsRef.current.contains(e.target)) {
        setClienteSuggestions([]);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // seleccionar cliente desde sugerencias
  const handleClienteSelect = (cliente) => {
    setFormData((s) => ({ ...s, clienteId: cliente.id }));
    setClienteQuery(cliente.nombre);
    setClienteSuggestions([]);

    // generar numeroFactura segun regimen del cliente
    const nf = generarNumeroFacturaManual(cliente.id);

    // calcular fecha de vencimiento automática (día 17)
    const fechaVenc = calcularFechaVencimientoAuto();

    const fechaPagoAuto = (formData.estatus || "").toLowerCase() === "pagado" ? todayYYYYMMDD() : "";

    setFormData((s) => ({
      ...s,
      numeroFactura: nf,
      fechaVencimiento: fechaVenc,
      fechaPago: fechaPagoAuto,
      clienteId: cliente.id,
    }));
    // bloquear edición del campo
    setClienteSuggestions([]);
    setDuplicateAlert("");
  };

  // Manejo general del formulario (otros campos)
  const handleFormChange = (e) => {
    const { name, value } = e.target;

    if (name === "estatus") {
      const nuevo = value;
      if (nuevo.toLowerCase() === "pagado") {
        setFormData((s) => ({ ...s, estatus: "Pagado", fechaPago: todayYYYYMMDD() }));
      } else {
        setFormData((s) => ({ ...s, estatus: value, fechaPago: "" }));
      }
      return;
    }

    setFormData((s) => ({ ...s, [name]: value }));
  };

  // ---------------------------------------
  // Validación: comprobar si existe pago para mismo cliente y mismo mes
  // ---------------------------------------
  const checkPagoExistente = async (clienteId, fechaVencimiento, currentPagoId = null) => {
    if (!clienteId || !fechaVencimiento) return false;

    const mmYYYY = fechaVencimiento.slice(0, 7); // 'YYYY-MM'

    try {
      const pagosRef = collection(db, "pagos");
      const q = query(pagosRef, where("clienteId", "==", clienteId));
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const encontrado = docs.find((p) => {
        if (!p.fechaVencimiento) return false;
        const fv = parseDateForInput(p.fechaVencimiento);
        if (!fv) return false;
        if (!fv.startsWith(mmYYYY)) return false;
        if (currentPagoId && p.id === currentPagoId) return false;
        return true;
      });

      return !!encontrado;
    } catch (err) {
      //console.error("Error chequeando pagos existentes:", err);
      return false;
    }
  };

  // Guardar pago (crear o actualizar)
  const handleSavePago = async (e) => {
    e.preventDefault();

    if (!formData.clienteId) {
      //alert("Selecciona un cliente válido (usa el autocompletado).");
      toast.warning("Selecciona un cliente válido (usa el autocompletado)");
      return;
    }
    if (!formData.monto || Number(formData.monto) < 0) {
      setToastError(
        "⚠️ Ingresa un monto válido ≥ 0"
      );
      return;
    }
    if (!formData.fechaVencimiento) {
      //alert("La fecha de vencimiento se asigna automáticamente y no puede dejarse vacía.");
      toast.info("La fecha de vencimiento se asigna automáticamente y no puede dejarse vacía");
      return;
    }

    if ((formData.estatus || "").toLowerCase() === "pagado" && !formData.metodoPago) {
      //alert("Cuando el estado es 'Pagado', el método de pago es obligatorio.");
      toast.warning("Cuando el estado es 'Pagado', el método de pago es obligatorio");
      return;
    }

    const existe = await checkPagoExistente(
      formData.clienteId,
      formData.fechaVencimiento,
      editingPago ? editingPago.id : null
    );

    if (existe) {
      const monthYear = formData.fechaVencimiento.slice(0, 7);
      const [anio, mes] = monthYear.split("-");
      setDuplicateAlert(
        `❌ Ya existe un registro de pago para este cliente en el mes ${mes}-${anio}. No se permite crear otro pago para el mismo mes.`
      );
      return;
    } else setDuplicateAlert("");

    try {
      const payload = {
        clienteId: formData.clienteId,
        monto: Number(formData.monto) || 0,
        numeroFactura: formData.numeroFactura || (formData.clienteId ? generarNumeroFacturaManual(formData.clienteId) : ""),
        fechaVencimiento: formData.fechaVencimiento || null,
        fechaPago: (formData.estatus || "").toLowerCase() === "pagado" ? (formData.fechaPago || todayYYYYMMDD()) : "",
        estatus: formData.estatus || "Pendiente",
        metodoPago: formData.metodoPago || "",
        periocidad: formData.periocidad || "Mensual",
        descripcion: formData.descripcion || "",
        mes: formData.fechaVencimiento ? formData.fechaVencimiento.slice(0, 7) : mesSeleccionado,
        creadoEn: serverTimestamp(),
      };

      if (editingPago) {
        // bloqueo si original fue pagado
        if (originalStatus && originalStatus.toLowerCase() === "pagado") {
          payload.estatus = "Pagado";
          if (!payload.fechaPago) payload.fechaPago = todayYYYYMMDD();
        } else {
          if ((payload.estatus || "").toLowerCase() === "pagado" && !payload.fechaPago) payload.fechaPago = todayYYYYMMDD();
          if ((payload.estatus || "").toLowerCase() !== "pagado") payload.fechaPago = "";
        }

        const ref = doc(db, "pagos", editingPago.id);
        await updateDoc(ref, payload);
        // =============================
        // 🟢 ENVIAR EMAIL SI SE PAGÓ
        // =============================
        if ((payload.estatus || "").toLowerCase() === "pagado") {
          await fetch(`${API_URL}/api/send-reminder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipoEnvio: "confirmacion",
              remitenteEmail: "despachocontablefiscal374@gmail.com",
              pago: {
                id: editingPago.id,
                ...payload
              }
            })
          });
        }
      } else {
        if (!payload.numeroFactura && payload.clienteId) payload.numeroFactura = generarNumeroFactura(payload.clienteId);
        if ((payload.estatus || "").toLowerCase() === "pagado" && !payload.fechaPago) payload.fechaPago = todayYYYYMMDD();

        await addDoc(collection(db, "pagos"), payload);
        // =============================
        // 🟢 ENVIAR EMAIL SI SE PAGÓ
        // =============================
        if ((payload.estatus || "").toLowerCase() === "pagado") {
          await fetch(`${API_URL}/api/send-reminder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipoEnvio: "confirmacion",
              remitenteEmail: "despachocontablefiscal374@gmail.com",
              pago: {
                id: editingPago.id,
                ...payload
              }
            })
          });
        }
      }

      setShowFormModal(false);
      setEditingPago(null);
      setOriginalStatus(null);
      setStatusLocked(false);
      setFormData(initialForm);
      setClienteQuery("");
      setClienteSuggestions([]);
      setDuplicateAlert("");
    } catch (err) {
      if (err.code === "permission-denied") {
        setError("🚫 No tienes permisos para realizar esta acción.");
      }
      console.error("Error guardando pago:", err);
      //alert("Error al guardar el pago. Revisa la consola.");
    }
  };

  const confirmDeletePago = async () => {
    if (!pagoToDelete) return;
    try {
      await deleteDoc(doc(db, "pagos", pagoToDelete.id));
      setShowConfirmDelete(false);
      setPagoToDelete(null);
    } catch (err) {
      //console.error("Error eliminando pago:", err);
      //alert("No se pudo eliminar el pago.");
      toast.error("No se pudo eliminar el pago");
    }
  };

  // Ver detalles
  const handleViewPago = (p) => {
    setViewPago(p);
    setShowViewModal(true);
  };

  // -------------------------
  // Historial: abrir modal
  // -------------------------
  const openHistoryModal = (clienteId) => {
    const cliente = getClientById(clienteId) || {};
    setHistoryClient(cliente);

    // filtrar pagos del cliente
    const pagosCliente = pagos
      .filter((p) => p.clienteId === clienteId)
      .map((p) => ({
        ...p,
        fechaVencimientoParsed: p.fechaVencimiento ? parseDateForInput(p.fechaVencimiento) : "",
        fechaPagoParsed: p.fechaPago ? parseDateForInput(p.fechaPago) : "",
      }))
      .sort((a, b) => {
        const aDate = a.mes || a.fechaVencimientoParsed;
        const bDate = b.mes || b.fechaVencimientoParsed;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return aDate.localeCompare(bDate);
      });

    setHistoryPayments(pagosCliente);
    setShowHistoryModal(true);
  };

  // ---------------------------------------
  // Exportar Excel / PDF (global)
  // ---------------------------------------
  const getFormattedDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  const handleExport = () => {
    // 🔹 Aplicar filtro según selección del usuario
    let dataFiltrada = [...filteredPagos];

    if (exportFilter === "pagado") {
      dataFiltrada = dataFiltrada.filter(p => p.estatus === "Pagado");
    }

    if (exportFilter === "pendiente") {
      dataFiltrada = dataFiltrada.filter(p => p.estatus === "Pendiente");
    }

    if (exportFilter === "vencido") {
      dataFiltrada = dataFiltrada.filter(p => p.estatus === "Vencido");
    }

    const dataToExport = dataFiltrada.map((p) => ({
      Cliente: p.clienteNombre,
      RFC: p.clienteEmail || "",
      "Régimen fiscal": p.clienteRegimen || "",
      Factura: p.numeroFactura || "",
      Monto: p.monto || 0,
      Estado: p.estatus || "",
      "Fecha de pago": p.fechaPago ? parseDateForInput(p.fechaPago) : "",
      "Fecha de vencimiento": p.fechaVencimiento ? parseDateForInput(p.fechaVencimiento) : "",
      "Método de pago": p.metodoPago || "",
      Descripcion: p.descripcion || "",
    }));

    if (exportFormat === "excel") exportToExcel(dataToExport);
    else exportToPDF(dataToExport);

    setShowExportModal(false);
  };


  const exportToExcel = (data, filename = null) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");
    const fileName = filename || `pagos_${getFormattedDateTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportToPDF = (rows, filename = null) => {
    // 🔥 REGISTRAR FUENTE UTF-8
    const doc2 = new jsPDF("landscape", "mm", "a4");
    doc2.setFont("helvetica", "normal");

    const pageWidth = doc2.internal.pageSize.getWidth();
    const pageHeight = doc2.internal.pageSize.getHeight();

    const verdePrincipal = [46, 125, 50];
    const verdeSecundario = [76, 175, 80];

    const fechaHora = new Date().toLocaleString();
    const addHeaderFirstPage = () => {
      try {
        doc2.addImage(logo, "PNG", 14, 10, 20, 20);
      } catch (error) { }

      doc2.setFont("helvetica", "bolt");
      doc2.setFontSize(18);
      doc2.setTextColor(...verdePrincipal);
      doc2.text("D-Conta & Fiscal +", pageWidth / 2, 18, { align: "center" });

      doc2.setFontSize(10);
      doc2.setTextColor(60, 60, 60);
      doc2.text(`Generado el: ${fechaHora}`, 14, 35);

      doc2.setDrawColor(...verdeSecundario);
      doc2.setLineWidth(0.8);
      doc2.line(14, 38, pageWidth - 14, 38);
    };

    const addFooter = (pageNumber, totalPages) => {
      const footerY = pageHeight - 10;
      doc2.setFont("helvetica");
      doc2.setFontSize(9);
      doc2.setTextColor(100);
      doc2.text("Reporte generado automáticamente por D-Conta & Fiscal +", 14, footerY);
      doc2.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, footerY, {
        align: "right",
      });
    };

    const head = ["Cliente", "RFC", "Régimen", "Factura", "Monto", "Estado", "Fecha pago", "Fecha venc."];
    const body = rows.map((r) => [
      r.Cliente,
      r.RFC,
      r["Régimen fiscal"],
      r.Factura,
      formatCurrency(r.Monto),
      r.Estado,
      r["Fecha de pago"],
      r["Fecha de vencimiento"],
    ]);

    autoTable(doc2, {
      startY: 42,
      headStyles: {
        fillColor: verdePrincipal,
        textColor: [255, 255, 255],
      },
      head: [head],
      body,
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      alternateRowStyles: { fillColor: [240, 255, 240] },
      didDrawPage: (data) => {
        const pageNumber = doc2.internal.getNumberOfPages();
        if (pageNumber === 1) addHeaderFirstPage();
        addFooter(pageNumber, "{total_pages_count_string}");
      },
    });

    if (typeof doc2.putTotalPages === "function") doc2.putTotalPages("{total_pages_count_string}");

    doc2.save(filename || `pagos_${getFormattedDateTime()}.pdf`);
  };

  // ---------------------------------------
  // Clasificación de pagos (individual y cliente)
  // ---------------------------------------
  // Clasifica un pago individual según fechaVencimiento vs fechaPago
  const classifySinglePayment = (p) => {
    // p.fechaVencimiento / p.fechaPago pueden venir en varios formatos
    if (!p || !p.fechaVencimiento) return "Pendiente";
    const vencStr = parseDateForInput(p.fechaVencimiento);
    const pagoStr = parseDateForInput(p.fechaPago);
    const vencDate = vencStr ? new Date(vencStr) : null;
    const pagoDate = pagoStr ? new Date(pagoStr) : null;

    if (!pagoDate) return "Pendiente";

    // Si pagó antes del vencimiento (strict)
    if (pagoDate < vencDate) return "Cumplido";

    // Si pagó entre el día 17 y 19 inclusive (consideramos el margen)
    // Note: para seguridad extra, comparamos con día del mes de la fecha de pago
    const diaPago = pagoDate.getDate();
    const diaVenc = vencDate.getDate(); // típicamente 17
    // Si la fecha de pago coincide con la fecha de vencimiento o día 18-19 => Puntual
    if (diaPago >= diaVenc && diaPago <= 19) return "Puntual";

    // Si pagó después del día 20 => Moroso
    if (diaPago >= 20 || pagoDate > vencDate) {
      // si la diferencia en días es > 0 y díaPago >= 20
      // También consideramos pagos en meses posteriores como morosos
      const diffDays = Math.floor((pagoDate - vencDate) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0) return "Moroso";
    }

    // Por defecto, si no cumple ninguna, conservamos "Puntual"
    return "Puntual";
  };

  // Dado un array de pagos del cliente, devuelve conteos y clasificación general
  const computeClientClassification = (payments) => {
    let counts = { Cumplido: 0, Puntual: 0, Moroso: 0, Pendiente: 0 };

    (payments || []).forEach((p) => {
      const c = classifySinglePayment(p);
      if (counts[c] !== undefined) counts[c]++;
      else counts.Pendiente++;
    });

    // Reglas de decisión:
    // - Si existe al menos 1 Moroso o Pendiente -> Cliente Moroso
    // - Else if existe mezcla de Cumplido y Puntual (y >0) -> Cliente Puntual
    // - Else if todos o la mayoría son Cumplido -> Cliente Cumplido
    let general = "Cumplido";
    if (counts.Moroso > 0 || counts.Pendiente > 0) general = "Moroso";
    else {
      // si no hay morosos ni pendientes
      const total = counts.Cumplido + counts.Puntual;
      if (total === 0) general = "Pendiente";
      else if (counts.Cumplido === total) general = "Cumplido";
      else general = "Puntual";
    }

    return { counts, general };
  };

  // ---------------------------------------
  // Exportar historial del cliente (PDF horizontal + Excel)
  // ---------------------------------------
  const exportClientHistoryExcel = (payments, cliente, filename = null) => {
    const rows = (payments || []).map((p) => ({
      "Fecha de vencimiento": p.fechaVencimiento ? parseDateForInput(p.fechaVencimiento) : "",
      "Fecha de pago": p.fechaPago ? parseDateForInput(p.fechaPago) : "",
      Monto: p.monto || 0,
      "Método": p.metodoPago || "",
      Estado: p.estatus || "",
      Clasificación: classifySinglePayment(p),
      Descripción: p.descripcion || "",
      Factura: p.numeroFactura || "",
    }));

    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, ws, "Historial");
    const fileName = filename || `historial_${cliente?.nombre || "cliente"}_${getFormattedDateTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportClientHistoryPDF = (payments, cliente, filename = null) => {
    const doc2 = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc2.internal.pageSize.getWidth();
    const pageHeight = doc2.internal.pageSize.getHeight();

    const verdePrincipal = [46, 125, 50];
    const verdeSecundario = [76, 175, 80];
    const fechaHora = new Date().toLocaleString();

    const { counts, general } = computeClientClassification(payments);

    // Header
    const addHeaderFirstPage = () => {
      try {
        doc2.addImage(logo, "PNG", 14, 10, 22, 22);
      } catch (error) {
        //console.warn("No se pudo cargar logo:", error);
      }
      doc2.setFont("helvetica", "bold");
      doc2.setFontSize(18);
      doc2.setTextColor(...verdePrincipal);
      doc2.text(`Historial de Pagos de ${cliente?.nombre || ""}`, pageWidth / 2, 18, { align: "center" });

      doc2.setFont("helvetica", "normal");
      doc2.setFontSize(11);
      doc2.setTextColor(60, 60, 60);
      doc2.text(`${cliente?.email || ""}`, 14, 36);

      // RFC y Régimen
      const rfcText = cliente?.rfc ? `RFC: ${cliente.rfc}` : "";
      const regimenText = cliente?.regimenFiscal ? `Régimen: ${cliente.regimenFiscal}` : "";
      doc2.text(`${rfcText} ${rfcText && regimenText ? "—" : ""} ${regimenText}`.trim(), 14, 44);

      // Clasificación general
      doc2.setFont("helvetica", "bold");
      let clsText = "";
      if (general === "Cumplido") clsText = "[OK]";
      if (general === "Puntual") clsText = "[A TIEMPO]";
      if (general === "Moroso") clsText = "[ATRASADO]";
      if (general === "Pendiente") clsText = "[PENDIENTE]";
      doc2.setFontSize(12);
      doc2.setTextColor(0, 0, 0);
      doc2.text(`Clasificación general: ${clsText} ${general}`, pageWidth - 14, 36, { align: "right" });
      doc2.setFont("helvetica", "normal");
      doc2.setFontSize(10);
      doc2.text(`Generado el: ${fechaHora}`, pageWidth - 14, 44, { align: "right" });

      doc2.setDrawColor(...verdeSecundario);
      doc2.setLineWidth(0.8);
      doc2.line(14, 48, pageWidth - 14, 48);
    };

    const addFooter = (pageNumber, totalPages) => {
      const footerY = pageHeight - 10;
      doc2.setFontSize(9);
      doc2.setTextColor(100);
      doc2.text("Reporte generado automáticamente por D-Conta & Fiscal +", 14, footerY);
      doc2.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, footerY, { align: "right" });
    };

    const head = [
      "Fecha vencimiento",
      "Fecha pago",
      "Factura",
      "Monto",
      "Método",
      "Estado",
      "Clasificación",
      "Descripción",
    ];
    const body = (payments || []).map((p) => [
      p.fechaVencimiento ? parseDateForInput(p.fechaVencimiento) : "-",
      p.fechaPago ? parseDateForInput(p.fechaPago) : "-",
      p.numeroFactura || "-",
      formatCurrency(p.monto || 0),
      p.metodoPago || "-",
      p.estatus || "-",
      classifySinglePayment(p),
      p.descripcion || "-",
    ]);

    autoTable(doc2, {
      startY: 52,
      head: [head],
      headStyles: {
        fillColor: verdePrincipal,
        textColor: [255, 255, 255],
      },
      body,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      didDrawPage: (data) => {
        const pageNumber = doc2.internal.getNumberOfPages();
        if (pageNumber === 1) addHeaderFirstPage();
        addFooter(pageNumber, "{total_pages_count_string}");
      },
      margin: { left: 14, right: 14 },
      theme: "grid",
    });

    // Resumen numérico
    const startY = doc2.lastAutoTable ? doc2.lastAutoTable.finalY + 8 : 52 + body.length * 8;
    doc2.setFontSize(10);
    doc2.setTextColor(0, 0, 0);
    const resumen = `${payments.length} pagos totales — ` + `${counts.Cumplido} Cumplidos, ` + `${counts.Puntual} Puntuales, ` + `${counts.Moroso} Morosos, ` + `${counts.Pendiente} Pendientes`;
    doc2.text(resumen, 14, Math.min(startY, pageHeight - 30));
    if (typeof doc2.putTotalPages === "function") doc2.putTotalPages("{total_pages_count_string}");

    doc2.save(filename || `historial_${cliente?.nombre || "cliente"}_${getFormattedDateTime()}.pdf`);
  };

  /*
  const handleDeleteBlocked = () => {
    alert(
      "🚫 Acción no permitida.\n\n" +
      "Los registros de pagos no pueden eliminarse por motivos de seguridad y control contable."
    );
  };
  */
 const handleDeleteBlocked = () => {
    toast.error(
      "🚫 Acción no permitida.\nLos registros de pagos no pueden eliminarse por motivos de seguridad y control contable.",
      { autoClose: 5000 }
    );
  };

  //console.log("Pagos actuales:", pagos);

  // ---------------------------------------
  // Render
  // ---------------------------------------
  return (
    <>
      <Navbar />
      <Container fluid className="bg-light min-vh-100 p-4">
        <header className="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h2 className="fw-bold">Seguimiento de pagos</h2>
            <p className="text-muted">Seguimiento y gestión de registros de pago</p>
          </div>

          <div className="d-flex gap-2">
            <Button variant="outline-dark" onClick={() => setShowExportModal(true)}>
              <Download size={16} /> Exportar
            </Button>
            <Button variant="dark" onClick={openNewPagoModal} className="d-flex align-items-center gap-2">
              <Plus size={16} /> Registrar Pago
            </Button>
          </div>
        </header>

        {/* estadísticas */}
        <Row className="g-4 mb-4">
          <Col md={3}>
            <Card
              className="stat-card hoverable"
              style={{ cursor: "pointer" }}
              onClick={() => handleStatClick("todos")}
            >
              <Card.Body>
                <h6>Cantidad total</h6>
                <h3>{formatCurrency(stats.totalMonto)}</h3>
                <small className="text-muted">{stats.totalRegistros} pagos</small>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stat-card hoverable"
              style={{ cursor: "pointer" }}
              onClick={() => handleStatClick("pagado")}
            >
              <Card.Body className="d-flex justify-content-between align-items-center">
                <div>
                  <h6>Pagado</h6>
                  {/*<h3 style={{ color: verde }}>{pagos.filter((p) => (p.estatus || p.estado || "").toLowerCase() === "pagado").length}</h3>*/}
                  <h3 style={{ color: verde }}>{stats.pagosPagados}</h3>
                  <small className="text-muted">Pagos completados</small>
                </div>
                <CreditCard className="text-success" size={30} />
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stat-card hoverable"
              style={{ cursor: "pointer" }}
              onClick={() => handleStatClick("pendiente")}
            >
              <Card.Body className="d-flex justify-content-between align-items-center">
                <div>
                  <h6>Pendiente</h6>
                  <h3 style={{ color: "#FFA000" }}>{stats.pagosPendientes}</h3>
                  <small className="text-muted">En espera de pago</small>
                </div>
                <Calendar className="text-warning" size={30} />
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stat-card hoverable"
              style={{ cursor: "pointer" }}
              onClick={() => handleStatClick("vencido")}
            >
              <Card.Body className="d-flex justify-content-between align-items-center">
                <div>
                  <h6>Atrasado</h6>
                  <h3 style={{ color: "red" }}>{stats.pagosVencidos}</h3>
                  <small className="text-muted">Fecha de vencimiento vencida</small>
                </div>
                <FileText className="text-danger" size={30} />
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* filtros */}
        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <h6 className="fw-bold">Filtros</h6>
          <Row className="g-3 align-items-center">
            <Col md={4}>
              <Form.Control
                placeholder="Búsqueda por cliente, factura o notas..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </Col>

            <Col md={2}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option>Todos los estatus</option>
                <option>Pagado</option>
                <option>Pendiente</option>
                <option>Vencido</option>
              </Form.Select>
            </Col>

            <Col md={2}>
              <Form.Control
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </Col>

            <Col md={2}>
              <Form.Select
                value={regimenFilter}
                onChange={(e) => {
                  setRegimenFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option>Todos los regímenes</option>
                {Array.from(new Set(clientes.map((c) => c.regimenFiscal).filter(Boolean))).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Form.Select>
            </Col>

            <Col md={2} className="text-end">
              <Form.Select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ width: "120px", display: "inline-block" }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </Form.Select>
            </Col>
          </Row>
        </div>

        {/* tabla */}
        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <small className="text-muted">Mostrando {filteredPagos.length} de {pagos.length} pagos</small>
          <Table hover responsive className="align-middle mt-2">
            <thead className="table-success">
              <tr>
                <th>Cliente</th>
                <th>Régimen</th>
                <th>Importe</th>
                <th>Fecha de vencimiento</th>
                <th>Fecha de pago</th>
                <th>Estado</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {currentPagos.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-4">
                    No hay pagos disponibles.
                  </td>
                </tr>
              ) : (
                currentPagos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="fw-semibold">{p.clienteNombre}</div>
                      <div className="text-muted small">{p.clienteEmail}</div>
                      <div className="text-muted small">{p.numeroFactura || "-"}</div>
                    </td>
                    <td>{p.clienteRegimen || "-"}</td>
                    <td className="fw-semibold">{formatCurrency(p.monto)}</td>
                    <td>{p.fechaVencimiento ? parseDateForInput(p.fechaVencimiento) : "-"}</td>
                    <td>{p.fechaPago ? parseDateForInput(p.fechaPago) : "-"}</td>
                    <td>
                      <Badge
                        bg={
                          (p.estatus || p.estado || "").toLowerCase() === "pagado"
                            ? "success"
                            : (p.estatus || p.estado || "").toLowerCase() === "pendiente"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {p.estatus || p.estado}
                      </Badge>
                    </td>
                    <td className="text-center">
                      <div className="d-flex justify-content-center gap-2">
                        <Button variant="outline-success" size="sm" onClick={() => handleViewPago(p)}>
                          <Eye size={14} />
                        </Button>

                        <Button variant="outline-primary" size="sm" onClick={() => openEditPagoModal(p)}>
                          <Edit size={14} />
                        </Button>

                        {/* Botón HISTORIAL (después de Ver) */}
                        <Button variant="outline-secondary" size="sm" onClick={() => openHistoryModal(p.clienteId)}>
                          <History size={14} />
                        </Button>

                        <Button variant="outline-danger" size="sm" onClick={() => setShowDeleteInfo(true)} >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>

          {/* paginación */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-muted">
              Mostrando {indexOfFirst + 1} a {Math.min(indexOfLast, filteredPagos.length)} de {filteredPagos.length} registros
            </small>
            <div className="d-flex gap-2">
              <Button
                size="sm"
                variant="outline-success"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Anterior
              </Button>
              <span className="align-self-center fw-semibold text-success">
                {currentPage} / {totalPages || 1}
              </span>
              <Button
                size="sm"
                variant="outline-success"
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>

        {/* Offcanvas Exportar */}
        <Offcanvas
          show={showExportModal}
          onHide={() => setShowExportModal(false)}
          placement="end"
          backdrop="static"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>Exportar pagos</Offcanvas.Title>
          </Offcanvas.Header>

          <Offcanvas.Body>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Formato</Form.Label>
                <Form.Select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="excel">Excel / CSV</option>
                  <option value="pdf">PDF</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Filtro</Form.Label>
                <Form.Select
                  value={exportFilter}
                  onChange={(e) => setExportFilter(e.target.value)}
                >
                  <option value="todos">Todos los registros</option>
                  <option value="pagado">Solo pagados</option>
                  <option value="pendiente">Solo pendientes</option>
                  <option value="vencido">Solo vencidos</option>
                </Form.Select>
              </Form.Group>

              <div className="d-grid gap-2 mt-4">
                <Button variant="dark" onClick={handleExport}>
                  <Download size={16} className="me-2" />
                  Descargar
                </Button>

                <Button
                  variant="outline-secondary"
                  onClick={() => setShowExportModal(false)}
                >
                  Cancelar
                </Button>
              </div>
            </Form>
          </Offcanvas.Body>
        </Offcanvas>

        {/* offcanvas Historial de pagos (por cliente) */}
        <Offcanvas
          show={showHistoryModal}
          onHide={() => setShowHistoryModal(false)}
          placement="end"
          backdrop="static"
          className="offcanvas-historial"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>
              Historial de pagos
            </Offcanvas.Title>
          </Offcanvas.Header>

          <Offcanvas.Body>
            {/* Info del cliente */}
            <div className="mb-3">
              <h6 className="mb-0">{historyClient?.nombre}</h6>
              <div className="text-muted small">{historyClient?.email}</div>
              <div className="text-muted small">
                RFC: {historyClient?.rfc || "-"} — Régimen: {historyClient?.regimenFiscal || "-"}
              </div>
            </div>

            {/* Acciones */}
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                size="sm"
                variant="outline-dark"
                onClick={() => exportClientHistoryPDF(historyPayments, historyClient)}
              >
                <Download size={14} className="me-1" />
                PDF
              </Button>

              <Button
                size="sm"
                variant="outline-success"
                onClick={() => exportClientHistoryExcel(historyPayments, historyClient)}
              >
                <Download size={14} className="me-1" />
                Excel
              </Button>
            </div>

            {/* Clasificación */}
            {(() => {
              const { counts, general } = computeClientClassification(historyPayments);
              let clsEmoji = "🟢";
              if (general === "Puntual") clsEmoji = "🟡";
              if (general === "Moroso") clsEmoji = "🔴";
              if (general === "Pendiente") clsEmoji = "⚠️";
              return (
                <div className="border rounded p-3 mb-3 bg-light">
                  <div className="fw-semibold">Clasificación general</div>
                  <div className="fs-5">{clsEmoji} {general}</div>
                  <div className="text-muted small mt-1">
                    {historyPayments.length} pagos — {counts.Cumplido} Cumplidos, {counts.Puntual} Puntuales, {counts.Moroso} Morosos, {counts.Pendiente} Pendientes
                  </div>
                </div>
              );
            })()}

            {/* Tabla */}
            <Table hover className="align-middle mt-2">
              <thead className="table-success">
                <tr>
                  <th>Vencimiento</th>
                  <th>Pago</th>
                  <th>Factura</th>
                  <th>Importe</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th>Clasificación</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {historyPayments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center text-muted py-4">
                      No hay historial para este cliente.
                    </td>
                  </tr>
                ) : (
                  historyPayments.map((hp) => (
                    <tr key={hp.id}>
                      <td>{hp.fechaVencimiento ? parseDateForInput(hp.fechaVencimiento) : "-"}</td>
                      <td>{hp.fechaPago ? parseDateForInput(hp.fechaPago) : "-"}</td>
                      <td>{hp.numeroFactura || "-"}</td>
                      <td className="fw-semibold">{formatCurrency(hp.monto)}</td>
                      <td>{hp.metodoPago || "-"}</td>
                      <td>
                        <Badge
                          bg={(hp.estatus || "").toLowerCase() === "pagado"
                            ? "success"
                            : (hp.estatus || "").toLowerCase() === "pendiente"
                              ? "warning"
                              : "danger"}
                        >
                          {hp.estatus || "-"}
                        </Badge>
                      </td>
                      <td>
                        {(() => {
                          const c = classifySinglePayment(hp);
                          if (c === "Cumplido") return "🟢 Cumplido";
                          if (c === "Puntual") return "🟡 Puntual";
                          if (c === "Moroso") return "🔴 Moroso";
                          return "⚠️ Pendiente";
                        })()}
                      </td>
                      <td>{hp.descripcion || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>

            <div className="d-grid mt-4">
              <Button
                variant="outline-secondary"
                onClick={() => setShowHistoryModal(false)}
              >
                Cerrar
              </Button>
            </div>
          </Offcanvas.Body>
        </Offcanvas>

        <Offcanvas
          show={showFormModal}
          onHide={() => setShowFormModal(false)}
          placement="end"
          backdrop="static"
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>
              {editingPago ? "Editar Pago" : "Nuevo Pago"}
            </Offcanvas.Title>
          </Offcanvas.Header>

          <Offcanvas.Body>
            <Form onSubmit={handleSavePago}>
              {/* formulario intacto */}
              {duplicateAlert && (
                <Alert variant="danger">{duplicateAlert}</Alert>
              )}

              <Row className="g-3">
                {/* CLIENTE (AUTOCOMPLETE) */}
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Cliente*</Form.Label>
                    <InputGroup>
                      <Form.Control
                        placeholder="Escribe nombre o correo para buscar..."
                        value={clienteQuery}
                        readOnly={!!formData.clienteId || !!editingPago} // bloquea si ya hay cliente o si estás editando
                        onChange={(e) => {
                          if (!editingPago) { // solo permitir escribir si NO se está editando
                            setClienteQuery(e.target.value);
                            setFormData((s) => ({ ...s, clienteId: "" }));
                            setDuplicateAlert("");
                          }
                        }}
                        required
                        autoComplete="off"
                      />
                      {/* Botón Cambiar cliente (solo al registrar, no al editar) */}
                      {!editingPago && formData.clienteId && (
                        <Button
                          variant="outline-secondary"
                          onClick={() => {
                            setClienteQuery("");
                            setFormData((s) => ({ ...s, clienteId: "" }));
                          }}
                        >
                          Cambiar cliente
                        </Button>
                      )}
                    </InputGroup>

                    {/* Sugerencias desplegables (solo clientes activos) */}
                    {clienteSuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="autocomplete-dropdown"
                      >
                        <ListGroup className="shadow">
                          {clienteSuggestions.map((c) => (
                            <ListGroup.Item
                              key={c.id}
                              action
                              onClick={() => handleClienteSelect(c)}
                            >
                              <div className="fw-semibold">{c.nombre}</div>
                              <div className="small text-muted">{c.email}</div>
                              <div className="small text-muted">Régimen: {c.regimenFiscal}</div>
                            </ListGroup.Item>
                          ))}
                        </ListGroup>
                      </div>
                    )}
                  </Form.Group>
                </Col>

                {/* IMPORTE */}
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Importe*</Form.Label>
                    <Form.Control
                      name="monto"
                      type="number"
                      min="0"
                      value={formData.monto}
                      onChange={handleFormChange}
                      required
                    />
                  </Form.Group>
                </Col>

                {/* NÚMERO DE FACTURA (AUTOGENERADO) */}
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>Número de factura</Form.Label>
                    <Form.Control
                      name="numeroFactura"
                      value={formData.numeroFactura}
                      onChange={handleFormChange}
                      readOnly
                      placeholder="Se genera automáticamente"
                    />
                  </Form.Group>
                </Col>

                {/* FECHA VENCIMIENTO (AUTOMÁTICA DÍA 17) */}
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Fecha de vencimiento*</Form.Label>
                    <Form.Control
                      type="date"
                      name="fechaVencimiento"
                      value={formData.fechaVencimiento}
                      onChange={handleFormChange}
                      required
                      disabled={(formData.estatus || "").toLowerCase() === "pagado"}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Estado*</Form.Label>
                    <Form.Select
                      name="estatus"
                      value={formData.estatus}
                      onChange={handleFormChange}
                      required
                      disabled={statusLocked}
                    >
                      <option>Pendiente</option>
                      <option>Pagado</option>
                      <option>Vencido</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                {/* METODO DE PAGO (OBLIGATORIO SOLO SI ESTATUS = Pagado) */}
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Método de pago{(formData.estatus || "").toLowerCase() === "pagado" ? "*" : ""}</Form.Label>
                    <Form.Select
                      name="metodoPago"
                      value={formData.metodoPago}
                      onChange={handleFormChange}
                      required={(formData.estatus || "").toLowerCase() === "pagado"}
                    >
                      <option value="">Seleccionar</option>
                      <option>Transferencia</option>
                      <option>Tarjeta</option>
                      <option>Efectivo</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                {/* PERIODICIDAD */}
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Periodicidad</Form.Label>
                    <Form.Select name="periocidad" value={formData.periocidad} onChange={handleFormChange}>
                      <option>Mensual</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                {/* DESCRIPCIÓN */}
                <Col md={12}>
                  <Form.Group>
                    <Form.Label>Descripción</Form.Label>
                    <Form.Control as="textarea" rows={2} name="descripcion" value={formData.descripcion} onChange={handleFormChange} />
                  </Form.Group>
                </Col>
              </Row>
              <div className="d-grid gap-2 mt-3">
                <Button variant="success" type="submit">{editingPago ? "Actualizar pago" : "Registrar pago"}</Button>
                <Button variant="outline-secondary" onClick={() => setShowFormModal(false)}>
                  Cancelar
                </Button>
              </div>
            </Form>
          </Offcanvas.Body>
        </Offcanvas>

        <Offcanvas
          show={showViewModal}
          onHide={() => setShowViewModal(false)}
          placement="end"

        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>Detalle del Pago</Offcanvas.Title>
          </Offcanvas.Header>

          <Offcanvas.Body>
            {/* renderizas los datos */}
            <Modal.Body>
              {viewPago ? (
                <>
                  <Row>
                    <Col md={6}>
                      <h6>{getClientById(viewPago.clienteId)?.nombre || viewPago.clienteNombre || "Cliente no encontrado"}</h6>
                      <div className="text-muted small">{getClientById(viewPago.clienteId)?.email || viewPago.clienteEmail || ""}</div>
                      <div className="text-muted small">RFC: {getClientById(viewPago.clienteId)?.rfc || "-"}</div>
                      <div className="text-muted small">Régimen: {getClientById(viewPago.clienteId)?.regimenFiscal || viewPago.clienteRegimen || "-"}</div>
                    </Col>
                    <Col md={6} className="text-end">
                      <h5 className="fw-semibold">{formatCurrency(viewPago.monto)}</h5>
                      <Badge
                        bg={
                          (viewPago.estatus || "").toLowerCase() === "pagado"
                            ? "success"
                            : (viewPago.estatus || "").toLowerCase() === "pendiente"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {viewPago.estatus}
                      </Badge>
                      <div className="text-muted small mt-2">Factura: {viewPago.numeroFactura || "-"}</div>
                    </Col>
                  </Row>

                  <hr />

                  <Row className="g-3">
                    <Col md={6}>
                      <div className="fw-semibold">Fecha de vencimiento</div>
                      <div>{viewPago.fechaVencimiento ? parseDateForInput(viewPago.fechaVencimiento) : "-"}</div>
                    </Col>
                    <Col md={6}>
                      <div className="fw-semibold">Fecha de pago</div>
                      <div>{viewPago.fechaPago ? parseDateForInput(viewPago.fechaPago) : "-"}</div>
                    </Col>
                    <Col md={6}>
                      <div className="fw-semibold">Método de pago</div>
                      <div>{viewPago.metodoPago || "-"}</div>
                    </Col>
                    <Col md={6}>
                      <div className="fw-semibold">Periodicidad</div>
                      <div>{viewPago.periocidad || "-"}</div>
                    </Col>

                    <Col md={12}>
                      <div className="fw-semibold">Descripción</div>
                      <div className="text-muted">{viewPago.descripcion || "-"}</div>
                    </Col>
                  </Row>
                </>
              ) : (
                <div>No hay datos para mostrar.</div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowViewModal(false)}>Cerrar</Button>
            </Modal.Footer>
          </Offcanvas.Body>
        </Offcanvas>

        <ToastContainer
          position="top-end"
          className="toast-navbar-offset"
        >
          <Toast
            show={showDeleteInfo}
            onClose={() => setShowDeleteInfo(false)}
            delay={3000}
            autohide
            bg="light"
          >
            <Toast.Body>
              🔒 Los pagos no pueden eliminarse por motivos de seguridad.
            </Toast.Body>
          </Toast>
        </ToastContainer>

        <ToastContainer position="top-end" className="toast-navbar-offset">
          <Toast
            show={!!toastError}
            onClose={() => setToastError("")}
            delay={3500}
            autohide
            bg="warning"
          >
            <Toast.Body>{toastError}</Toast.Body>
          </Toast>
        </ToastContainer>


      </Container>
    </>
  );
}