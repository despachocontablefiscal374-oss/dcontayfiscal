import React, { useEffect, useMemo, useState } from "react";
import { Container, Row, Col, Card, Table, Toast, ToastContainer, Button, Badge, Form, Modal } from "react-bootstrap";
import { ArrowLeft, Download, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import { toast } from "react-toastify";
import { db } from "../firebaseConfig";
import { collection, onSnapshot, getDocs, query, where } from "firebase/firestore";

import { Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS, LineElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, PointElement,
} from "chart.js";
ChartJS.register(LineElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend, PointElement);
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useRef } from "react";
import autoTable from "jspdf-autotable";
import logo from "../assets/logo.png";

// util: parsea fechas de los documentos (string "YYYY-MM-DD" o objeto timestamp de firestore)
const parseDate = (val) => {
  if (!val) return null;
  if (typeof val === "string") {
    // algunos campos vienen como "2025-10-24" u "24 de octubre de 2025..."
    // priorizamos ISO-like "YYYY-MM-DD"
    const iso = val.match(/^\d{4}-\d{2}-\d{2}/);
    if (iso) return new Date(iso[0]);
    // intentar parsear fecha legible
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }
  if (val.seconds) return new Date(val.seconds * 1000);
  try {
    return new Date(val);
  } catch {
    return null;
  }
};

const monthNames = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

export default function Panel() {
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, "");

  const [clientes, setClientes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [plantillaAviso, setPlantillaAviso] = useState(null);
  const lineChartRef = useRef(null);
  const pieChartRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [onConfirmAction, setOnConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [enviandoCorreos, setEnviandoCorreos] = useState(false);

  // filtros
  const today = new Date();
  const currentYear = today.getFullYear();

  //const [selectedYear, setSelectedYear] = useState(currentYear);
  //const [selectedMonth, setSelectedMonth] = useState("Todos"); // "Todos" o 1..12
  const [granularidad, setGranularidad] = useState("Mensual"); // Diario, Semanal, Mensual
  const [monthFilter, setMonthFilter] = useState("");
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedMonth, setSelectedMonth] = useState("Todos");
  const [exportFormat, setExportFormat] = useState("excel");
  const [exportFilter, setExportFilter] = useState("todos");
  const [confirmModal, setConfirmModal] = useState(null);
  const [notifyModal, setNotifyModal] = useState(null);
  const [confirmToast, setConfirmToast] = useState({
    show: false,
    title: "",
    message: "",
    variant: "danger",
    onConfirm: null
  });

  const openConfirmToast = ({ title, message, onConfirm, variant = "danger" }) => {
    setConfirmToast({
      show: true,
      title,
      message,
      variant,
      onConfirm
    });
  };

  const openConfirm = ({ title, message, onConfirm }) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const openNotify = (message, type = "info") => {
    setNotifyModal({ message, type });
  };

  useEffect(() => {
    if (!monthFilter) {
      // Si NO hay mes seleccionado -> año completo
      setSelectedMonth("Todos");
      setSelectedYear("2025"); // o año actual
    } else {
      const [year, month] = monthFilter.split("-");
      setSelectedYear(year);
      setSelectedMonth(String(Number(month))); // convierte "08" → "8"
    }
  }, [monthFilter]);

  // cargar colecciones en tiempo real
  useEffect(() => {
    const unsubC = onSnapshot(collection(db, "clientes"), (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubP = onSnapshot(collection(db, "pagos"), (snap) => {
      setPagos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // traer plantilla aviso activa (si existe)
    (async () => {
      try {
        const q = query(collection(db, "plantillasCorreo"), where("tipo", "==", "aviso"), where("activa", "==", true));
        const docs = await getDocs(q);
        if (!docs.empty) setPlantillaAviso({ id: docs.docs[0].id, ...docs.docs[0].data() });
      } catch (e) {
        // no fatal
      }
    })();

    return () => {
      unsubC();
      unsubP();
    };
  }, []);

  const clientesMap = useMemo(() => {
    const map = {};
    clientes.forEach(c => {
      map[c.id] = c;
    });
    return map;
  }, [clientes]);

  // UTIL: filtrar pagos por mes/año seleccionados (si month="Todos" devolvemos todo el año)
  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      // si no tiene mes, intentar deducir de fechaVencimiento o fechaPago
      let mesField = p.mes || "";
      if (!mesField) {
        const fv = parseDate(p.fechaVencimiento) || parseDate(p.fechaPago);
        if (fv) mesField = `${fv.getFullYear()}-${String(fv.getMonth() + 1).padStart(2, "0")}`;
      }
      // mesField esperado "YYYY-MM"
      if (!mesField) return false;
      const [y, m] = mesField.split("-");
      const añoPago = Number(y);
      const mesPago = Number(m);

      if (Number(selectedYear) !== añoPago) return false;
      if (selectedMonth === "Todos") return true;
      return mesPago === Number(selectedMonth);
    });
  }, [pagos, selectedYear, selectedMonth]);

  // Totales (todos los meses del filtro)
  const totals = useMemo(() => {
    const pagados = pagosFiltrados.filter(
      (p) => (p.estatus || "").toLowerCase() === "pagado"
    );

    const pendientes = pagosFiltrados.filter(
      (p) => (p.estatus || "").toLowerCase() === "pendiente"
    );

    const vencidos = pagosFiltrados.filter(
      (p) => (p.estatus || "").toLowerCase() === "vencido"
    );

    const sum = (arr) =>
      arr.reduce((s, it) => s + Number(it.monto || 0), 0);

    return {
      totalPagadoCount: pagados.length,
      totalPagadoAmount: sum(pagados),

      totalPendienteCount: pendientes.length,
      totalPendienteAmount: sum(pendientes),

      totalAtrasadoCount: vencidos.length,
      totalAtrasadoAmount: sum(vencidos),

      totalRegistros: pagosFiltrados.length,
    };
  }, [pagosFiltrados]);

  const montoAtrasadoTotal =
    totals.totalAtrasadoAmount + totals.totalPendienteAmount;

  // "Este mes" (si selectedMonth != Todos -> usar ese mes; si Todos -> usar current month)
  const esteMesTotals = useMemo(() => {
    const mesToCheck = selectedMonth === "Todos" ? String(today.getMonth() + 1).padStart(2, "0") : String(selectedMonth).padStart(2, "0");
    const añoToCheck = selectedMonth === "Todos" ? today.getFullYear() : Number(selectedYear);

    const pagosMes = pagos.filter((p) => {
      let mesField = p.mes || "";
      if (!mesField) {
        const fv = parseDate(p.fechaVencimiento) || parseDate(p.fechaPago);
        if (fv) mesField = `${fv.getFullYear()}-${String(fv.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!mesField) return false;
      const [y, m] = mesField.split("-");
      return Number(y) === Number(añoToCheck) && m === mesToCheck;
    });

    const total = pagosMes.reduce((s, it) => s + Number(it.monto || 0), 0);
    return total;
  }, [pagos, selectedMonth, selectedYear]);

  // ==========================================
  // TENDENCIAS DE INGRESOS (CORREGIDO)
  // ==========================================
  const tendenciasData = useMemo(() => {
    const colorLinea = "#4CAF50";

    // caso: usuario elige un mes específico
    if (selectedMonth !== "Todos") {
      const año = Number(selectedYear);
      const mesIndex = Number(selectedMonth) - 1;

      // =====================
      // 1) DIARIO
      // =====================
      if (granularidad === "Diario") {
        const daysInMonth = new Date(año, mesIndex + 1, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);

        const data = labels.map((_, dayIndex) => {
          const d = dayIndex + 1;
          return pagos
            .filter((p) => {
              const fp = parseDate(p.fechaPago);
              if (!fp) return false;
              return (
                fp.getFullYear() === año &&
                fp.getMonth() === mesIndex &&
                fp.getDate() === d &&
                (p.estatus || "").toLowerCase() === "pagado"
              );
            })
            .reduce((a, b) => a + Number(b.monto || 0), 0);
        });

        return {
          labels,
          datasets: [
            {
              label: `Ingresos diarios - ${monthNames[mesIndex]} ${año}`,
              data,
              borderColor: colorLinea,
              backgroundColor: "rgba(76,175,80,0.15)",
              tension: 0.3,
              borderWidth: 3,
            },
          ],
        };
      }

      // =====================
      // 2) SEMANAL
      // =====================
      if (granularidad === "Semanal") {
        const daysInMonth = new Date(año, mesIndex + 1, 0).getDate();

        const semanas = [];
        for (let s = 1; s <= daysInMonth; s += 7) {
          const start = s;
          const end = Math.min(s + 6, daysInMonth);
          semanas.push({ start, end, label: `D${start}-D${end}` });
        }

        const data = semanas.map((sem) => {
          return pagos
            .filter((p) => {
              const fp = parseDate(p.fechaPago);
              if (!fp) return false;
              return (
                fp.getFullYear() === año &&
                fp.getMonth() === mesIndex &&
                fp.getDate() >= sem.start &&
                fp.getDate() <= sem.end &&
                (p.estatus || "").toLowerCase() === "pagado"
              );
            })
            .reduce((a, b) => a + Number(b.monto || 0), 0);
        });

        return {
          labels: semanas.map((s) => s.label),
          datasets: [
            {
              label: `Ingresos semanales - ${monthNames[mesIndex]} ${año}`,
              data,
              borderColor: colorLinea,
              backgroundColor: "rgba(76,175,80,0.15)",
              tension: 0.3,
              borderWidth: 3,
            },
          ],
        };
      }
    }

    // =====================
    // 3) MENSUAL - Año completo
    // =====================
    const meses = Array.from({ length: 12 }, (_, i) => {
      const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
      const total = pagos
        .filter((p) => {
          const mesField = p.mes || (() => {
            const fv = parseDate(p.fechaVencimiento) || parseDate(p.fechaPago);
            return fv ? `${fv.getFullYear()}-${String(fv.getMonth() + 1).padStart(2, "0")}` : "";
          })();
          return mesField === key && (p.estatus || "").toLowerCase() === "pagado";
        })
        .reduce((a, b) => a + Number(b.monto || 0), 0);

      return { label: monthNames[i], total };
    });

    return {
      labels: meses.map((m) => m.label),
      datasets: [
        {
          label: `Ingresos ${selectedYear}`,
          data: meses.map((m) => m.total),
          borderColor: "#4CAF50",
          backgroundColor: "rgba(76,175,80,0.15)",
          tension: 0.3,
          borderWidth: 3,
        },
      ],
    };
  }, [pagos, selectedMonth, selectedYear, granularidad]);

  // Pie data con colores solicitados
  const pagosPagadosCount = pagosFiltrados.filter(
    (p) => (p.estatus || "").toLowerCase() === "pagado"
  ).length;

  const pagosPendientesCount = pagosFiltrados.filter(
    (p) => (p.estatus || "").toLowerCase() === "pendiente"
  ).length;

  const pagosAtrasadosCount = pagosFiltrados.filter(
    (p) => (p.estatus || "").toLowerCase() === "vencido"
  ).length;

  function parseDateFlexible(value) {
    if (!value) return null;

    // Firestore timestamp
    if (typeof value === "object" && value.seconds) {
      return new Date(value.seconds * 1000);
    }

    // Date object
    if (value instanceof Date) {
      return value;
    }

    // String YYYY-MM-DD
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(value + "T00:00:00");
    }

    // String DD/MM/YYYY
    if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [d, m, y] = value.split("/");
      return new Date(`${y}-${m}-${d}T00:00:00`);
    }

    const maybe = new Date(value);
    return isNaN(maybe) ? null : maybe;
  }

  function getMes(fecha) {
    const d = parseDateFlexible(fecha);
    if (!d) return "—";
    return d.toLocaleString("es-MX", { month: "long" });
  }

  const pieData = {
    labels: ["Pagado", "Pendiente", "Atrasado"],
    datasets: [
      {
        data: [pagosPagadosCount, pagosPendientesCount, pagosAtrasadosCount],
        backgroundColor: ["#4CAF50", "#FFA000", "red"],
        borderColor: "#fff",
        borderWidth: 2,
      },
    ],
  };

  // Próximos pagos (7 días) en contexto del filtro (si month=Todos -> buscar próximos 7 días en cualquier mes/año)
  const proximos = pagos.filter((p) => {
    const fv = parseDate(p.fechaVencimiento);
    if (!fv) return false;
    const diff = (fv - new Date()) / (1000 * 60 * 60 * 24);
    if (diff < 0 || diff > 7) return false;
    // respetar filtro año/mes
    if (selectedMonth !== "Todos") {
      const [y, m] = (p.mes || `${fv.getFullYear()}-${String(fv.getMonth() + 1).padStart(2, "0")}`).split("-");
      
      return Number(y) === Number(selectedYear) && Number(m) === Number(selectedMonth);
    }
    return Number(fv.getFullYear()) === Number(selectedYear);
  });

  // pagos vencidos (según filtro)
  const pagosVencidos = pagosFiltrados.filter(
    (p) => (p.estatus || "").toLowerCase() === "vencido"
  );

  // pagos pendientes (según filtro)
  const pagosPendientes = pagosFiltrados.filter(
    (p) => (p.estatus || "").toLowerCase() === "pendiente"
  );

  // Enviar aviso (usa endpoint de tu backend)
  const enviarAviso = async (pago) => {
    if (enviandoCorreos) return; // 🔒 bloqueo

    setEnviandoCorreos(true);

    try {
      const res = await fetch(`${API_URL}/api/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoEnvio: "aviso",
          origen: "manual",
          remitenteEmail: "despachocontablefiscal374@gmail.com",
          pago,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      toast.success("Aviso enviado correctamente");
    } catch (e) {
      console.error("Error enviando aviso:", e);
      toast.error("Error al enviar aviso");
    } finally {
      setEnviandoCorreos(false);
    }
  };

  // años disponibles (tomados de pagos.mes)
  const availableYears = useMemo(() => {
    const setY = new Set();
    pagos.forEach((p) => {
      const mesField = p.mes || (() => {
        const fv = parseDate(p.fechaVencimiento) || parseDate(p.fechaPago);
        return fv ? `${fv.getFullYear()}-${String(fv.getMonth() + 1).padStart(2, "0")}` : "";
      })();
      if (mesField) setY.add(Number(mesField.split("-")[0]));
    });
    const arr = Array.from(setY).sort((a, b) => b - a);
    if (!arr.includes(currentYear)) arr.unshift(currentYear);
    return arr;
  }, [pagos, currentYear]);

  // etiqueta del periodo mostrado (debajo del título)
  const periodoLabel = useMemo(() => {
    if (selectedMonth === "Todos") return `AÑO ${selectedYear}`;
    const mIndex = Number(selectedMonth) - 1;
    return `${monthNames[mIndex]} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  const sendRecordatoriosProximos = () => {
    if (proximos.length === 0) {
      openNotify("No hay pagos próximos para recordar");
      return;
    }

    openConfirmToast({
      title: "Confirmar envío",
      message: `¿Enviar recordatorio a ${proximos.length} clientes?`,
      variant: "success",
      onConfirm: async () => {
        if (enviandoCorreos) return;

        setEnviandoCorreos(true);

        try {
          for (const pago of proximos) {
            await fetch(`${API_URL}/api/send-reminder`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipoEnvio: "recordatorio",
                origen: "manual",
                remitenteEmail: "despachocontablefiscal374@gmail.com",
                pago,
              }),
            });
          }

          toast.success("Recordatorios enviados correctamente");
        } catch (err) {
          console.error(err);
          toast.error("Error al enviar recordatorios");
        } finally {
          setEnviandoCorreos(false);
        }
      },
    });
  };

  const sendRecordatoriosMasivos = () => {
    if (pagosVencidos.length === 0) {
      toast.info("No hay clientes atrasados");
      return;
    }

    openConfirmToast({
      title: "Confirmar avisos masivos",
      message: `¿Enviar aviso de vencimiento a ${pagosVencidos.length} clientes atrasados?`,
      variant: "danger",
      onConfirm: async () => {
        if (enviandoCorreos) return;

        setEnviandoCorreos(true);

        try {
          for (const pago of pagosVencidos) {
            await fetch(`${API_URL}/api/send-reminder`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tipoEnvio: "aviso",
                origen: "manual",
                remitenteEmail: "despachocontablefiscal374@gmail.com",
                pago,
              }),
            });
          }

          toast.success("Avisos de vencimiento enviados");
        } catch (err) {
          console.error(err);
          toast.error("Error enviando avisos de vencimiento");
        } finally {
          setEnviandoCorreos(false);
        }
      },
    });
  };

  const captureChart = async (ref) => {
    if (!ref.current) return null;
    const canvas = await html2canvas(ref.current);
    return canvas.toDataURL("image/png");
  };

  const getFormattedDateTime = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
          `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const mapRows = (pagos) =>
    pagos.map(p => ([
      clientesMap[p.clienteId]?.nombre || "—",
      p.numeroFactura || "—",
      p.monto
        ? `$${Number(p.monto).toLocaleString("es-MX")}`
        : "$0",
      p.fechaVencimiento
        ? new Date(p.fechaVencimiento).toLocaleDateString("es-MX")
        : "—",
      p.estatus || "—"
    ]));


  const handleExport = () => {
    let source = exportFilter === "mes"
      ? [...pagosFiltrados]
      : [...pagos];

    if (exportFormat === "excel") {
      exportAnalisisToExcel(source);
    } else {
      exportAnalisisToPDF(source);
    }
  };

  const exportAnalisisToExcel = (pagos) => {
    const data = pagos.map(p => ({
      Cliente: clientesMap[p.clienteId]?.nombre || "",
      Factura: p.numeroFactura || "",
      Monto: p.monto || 0,
      "Fecha Vencimiento": p.fechaVencimiento || "",
      Estatus: p.estatus || "",
      Notas: p.notas || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");

    XLSX.writeFile(
      workbook,
      `analisis_${getFormattedDateTime()}.xlsx`
    );
  };

  const exportPagosToPDF = (pagos) => {
    const doc = new jsPDF("p", "mm", "a4");

    const tableColumns = [
      "Cliente",
      "Factura",
      "Monto",
      "Vencimiento",
      "Estatus"
    ];

    const tableRows = pagos.map(p => [
      clientesMap[p.clienteId]?.nombre || "",
      p.numeroFactura || "",
      `$${p.monto}`,
      p.fechaVencimiento || "",
      p.estatus || ""
    ]);

    autoTable(doc, {
      startY: 42,
      head: [tableColumns],
      body: tableRows,
      // mismos estilos que Clientes
    });

    doc.save(`analisis_${getFormattedDateTime()}.pdf`);
  };

  const exportAnalisisToPDF = async () => {
    const doc = new jsPDF("p", "mm", "a4");
    let y = 20;

    // LOGO
    doc.addImage(logo, "PNG", 15, 10, 30, 20);

    // TÍTULO
    doc.setFontSize(16);
    doc.text("Reporte de Análisis Financiero", 50, 20);

    // FECHA
    doc.setFontSize(10);
    doc.text(`Generado el: ${new Date().toLocaleString()}`, 50, 26);

    y = 30;

    const ensureSpace = (requiredHeight) => {
      if (y + requiredHeight > 270) {
        doc.addPage();
        y = 20;
      }
    };

    // ===== GRÁFICAS =====
    const lineImg = await captureChart(lineChartRef);
    const pieImg = await captureChart(pieChartRef);

    // Gráficas lado a lado
    if (lineImg && pieImg) {
      doc.setFontSize(11);
      doc.text("Resumen gráfico", 15, y);
      y += 4;

      doc.addImage(lineImg, "PNG", 15, y, 85, 45);
      doc.addImage(pieImg, "PNG", 110, y, 85, 45);

      y += 50;
    }

    /*if (lineImg) {
      doc.text("Tendencia de Ingresos", 15, y);
      y += 5;
      doc.addImage(lineImg, "PNG", 15, y, 180, 60);
      y += 70;
    }

    if (pieImg) {
      doc.text("Distribución de Pagos", 15, y);
      y += 5;
      doc.addImage(pieImg, "PNG", 50, y, 100, 60);
      y += 70;
    }*/

    console.log("Pendientes:", pagosPendientes);
    console.log("Vencidos:", pagosVencidos);
    console.log("Próximos:", proximos);


    // ===== TABLAS =====
    const addTableSection = (title, rows) => {
      if (!rows.length) return;

      ensureSpace(20);

      doc.setFontSize(11);
      doc.text(title, 15, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Cliente", "Factura", "Monto", "Venc.", "Estatus"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0,153,74], textColor: 255 },
      });

      y = doc.lastAutoTable.finalY + 6;
    };

    addTableSection(
      "Pagos Pendientes",
      mapRows(pagosPendientes)
    );

    addTableSection(
      "Pagos Vencidos",
      mapRows(pagosVencidos)
    );

    addTableSection(
      "Próximos Pagos",
      mapRows(proximos)
    );

    // PIE DE PÁGINA
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(
        `D-Conta & Fiscal · Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    doc.save(`analisis_${getFormattedDateTime()}.pdf`);
  };


  return (
    <>
    <Navbar/>
      <Container fluid className="bg-light p-4 min-vh-100">
        {/* encabezado + filtros */}
        <div className="d-flex align-items-center gap-3 mb-3">
          <Button variant="outline-secondary" onClick={() => navigate("/dashboard")}>
            <ArrowLeft size={18} /> Volver
          </Button>

          <div>
            <h2 className="fw-bold">Dashboard & Análisis</h2>
            <p className="text-muted">Descripción general del rendimiento de su negocio</p>
            <div className="mt-2">
              <small className="text-muted">Tendencias de Ingresos · <strong>{periodoLabel}</strong></small>
            </div>
          </div>
        </div>

        {/* tarjetas resumen */}
        <Row className="g-3 mb-4">
          <Col md={2}>
            <Card className="p-3">
              <h6>Total de Clientes</h6>
              <h3>{clientes.length}</h3>
              <small>{clientes.filter((c) => c.estado === "Activo").length} clientes activos</small>
            </Card>
          </Col>

          <Col md={3}>
            <Card className="p-3">
              <h6>Ingresos Totales</h6>
              <h3>${totals.totalPagadoAmount.toLocaleString()}</h3>
              <small>Todos los ingresos (filtro actual)</small>
            </Card>
          </Col>

          <Col md={2}>
            <Card className="p-3">
              <h6>Este mes</h6>
              <h3>${Number(esteMesTotals || 0).toLocaleString()}</h3>
              <small>Ingresos del mes actual</small>
            </Card>
          </Col>

          <Col md={3}>
            <Card className="p-3">
              <h6>Monto atrasado</h6>
              <h3 className="text-danger">
                ${montoAtrasadoTotal.toLocaleString()}
              </h3>
              <small>
                {totals.totalAtrasadoCount} pagos atrasados ·{" "}
                {totals.totalPendienteCount} pagos pendientes
              </small>
            </Card>
          </Col>

          <Col md={2}>
            <Form.Group className="mb-3">
              <Form.Label>Filtrar por mes</Form.Label>
              <Form.Control
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </Form.Group>
          </Col>
        </Row>

        {/* graficas */}
        <Row className="g-4">
          <Col md={8}>
            <Card className="p-3 shadow-sm">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="fw-bold">Tendencias de Ingresos</h6>

                <Form.Select
                  style={{ width: "150px" }}
                  value={granularidad}
                  onChange={(e) => setGranularidad(e.target.value)}
                >
                  <option>Diario</option>
                  <option>Semanal</option>
                  <option>Mensual</option>
                </Form.Select>

              </div>

              <div className="mt-4" ref={lineChartRef}>
                <Line data={tendenciasData} />
              </div>
            </Card>
          </Col>

          <Col md={4}>
            <Card className="p-3 text-center">
              <h6 className="fw-bold">Distribución del Estado de Pago</h6>
              <p className="text-muted">Pendiente / Pagado / Atrasado</p>
              <div ref={pieChartRef}>
                <Pie data={pieData} />
              </div>
              <div className="mt-3 d-flex justify-content-around">
                <div>
                  <Badge bg="success"> </Badge> <small> Pagado: {pagosPagadosCount}</small>
                </div>
                <div>
                  <Badge bg="warning"> </Badge> <small> Pendiente: {pagosPendientesCount}</small>
                </div>
                <div>
                  <Badge bg="danger"> </Badge> <small> Atrasado: {pagosAtrasadosCount}</small>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* proximos pagos + pagos vencidos */}
        <Row className="g-4 mt-4">
          <Col md={6}>
            <Card className="p-3">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="fw-bold">Próximos Pagos</h6>
                <Button
                  size="sm"
                  variant="outline-primary"
                  onClick={sendRecordatoriosProximos}
                  className="d-flex align-items-center gap-2"
                  disabled={enviandoCorreos}
                >
                  <Mail size={14} /> Enviar recordatorios
                </Button>
              </div>
              <p className="text-muted">Pagos vencidos en los próximos 7 días (según filtro)</p>
              {proximos.length === 0 ? (
                <p className="text-muted text-center">No hay pagos próximos</p>
              ) : (
                <Table hover>
                  <tbody>
                    {proximos.map((p) => (
                      <tr key={p.id}>
                        <td>{clientesMap[p.clienteId]?.nombre || "Cliente eliminado"}</td>
                        <td>{p.fechaVencimiento}</td>
                        <td>${Number(p.monto || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </Col>

          <Col md={6}>
            <Card className="p-3">
              <h6 className="fw-bold" >Pagos pendientes</h6>
              {pagosPendientes.length === 0 ? (
                <p className="text-muted text-center">No hay pagos pendientes</p>
              ) : (
                <Table hover>
                  <tbody>
                    {pagosPendientes.map((p) => (
                      <tr key={p.id}>
                        <td>{clientesMap[p.clienteId]?.nombre || "N/A"}</td>
                        <td className="text-warning">${Number(p.monto || 0).toLocaleString()}</td>
                        <td>
                          <Badge bg="warning" className="text-write">Pendientes</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </Col>
        </Row>

        <Modal show={!!confirmModal} onHide={() => setConfirmModal(null)} centered>
          <Modal.Header closeButton>
            <Modal.Title>{confirmModal?.title}</Modal.Title>
          </Modal.Header>
          <Modal.Body>{confirmModal?.message}</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>
              Cancelar
            </Button>
            <Button
              variant="success"
              onClick={async () => {
                await confirmModal.onConfirm();
                setConfirmModal(null);
              }}
            >
              Confirmar
            </Button>
          </Modal.Footer>
        </Modal>

        <ToastContainer position="top-center" className="mt-5">
          <Toast
            show={confirmToast.show}
            onClose={() => setConfirmToast({ ...confirmToast, show: false })}
            bg="light"
          >
            <Toast.Header>
              <strong className="me-auto">{confirmToast.title}</strong>
            </Toast.Header>

            <Toast.Body>
              {confirmToast.message}

              <div className="d-flex justify-content-end gap-2 mt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setConfirmToast({ ...confirmToast, show: false })
                  }
                >
                  Cancelar
                </Button>

                <Button
                  size="sm"
                  variant={confirmToast.variant}
                  onClick={async () => {
                    await confirmToast.onConfirm?.();
                    setConfirmToast({ ...confirmToast, show: false });
                  }}
                >
                  Confirmar
                </Button>
              </div>
            </Toast.Body>
          </Toast>
        </ToastContainer>

        <Modal show={!!notifyModal} onHide={() => setNotifyModal(null)} centered>
          <Modal.Body className="text-center">
            <h5 className={
              notifyModal?.type === "success" ? "text-success" :
                notifyModal?.type === "error" ? "text-danger" :
                  "text-primary"
            }>
              {notifyModal?.message}
            </h5>
            <Button className="mt-3" onClick={() => setNotifyModal(null)}>
              Entendido
            </Button>
          </Modal.Body>
        </Modal>

        {/* clientes atrasados */}
        <Card className="p-3 mt-4">
          <div className="d-flex justify-content-between">
            <h4 className="fw-bold">Clientes Atrasados</h4>
            <Button
              variant="outline-danger"
              onClick={sendRecordatoriosMasivos}
              className="d-flex align-items-center gap-2"
              disabled={enviandoCorreos}
            >
              <Mail size={16} /> Enviar Avisos
            </Button>
          </div>
          <p className="text-muted">Clientes con pagos vencidos que requieren atención</p>

          <Table hover>
            <thead className="table-success">
              <tr>
                <th>Nombre del Cliente</th>
                <th>Correo electrónico</th>
                <th>Teléfono</th>
                <th>Mes</th>
                <th>Estatus</th>
              </tr>
            </thead>

            <tbody>
              {pagosVencidos.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted">
                    No hay clientes atrasados
                  </td>
                </tr>
              ) : (
                pagosVencidos.map((p) => {
                  const cliente = clientesMap[p.clienteId] || {};
                  return (
                    <tr key={p.id}>
                      <td>{cliente.nombre || "Sin nombre"}</td>
                      <td>{cliente.email || "Sin correo"}</td>
                      <td>{cliente.telefono || "N/A"}</td>
                      <td className="text-capitalize">
                        {getMes(p.fechaVencimiento)}
                      </td>
                      <td>
                        <Badge bg="danger">Atrasados</Badge>
                      </td>
                      <td>
                        <Button disabled={enviandoCorreos} size="sm" variant="outline-danger" onClick={() => enviarAviso(p)}>
                          Enviar Aviso
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </Container>
    </>
  );
}
