import { useState, useEffect } from "react";
import { Button, Form, Table, Badge, Modal, Toast, ToastContainer, Offcanvas, Container, Row, Col } from "react-bootstrap";
import { ArrowLeft, Plus, Download, Phone, Eye, Edit, Trash2, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { collection, getDocs, updateDoc, addDoc, doc } from "firebase/firestore";
import * as XLSX from "xlsx";
import Navbar from "./Navbar";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../assets/logo.png";
import { useError } from "../context/ErrorContext";
import { toast } from "react-toastify";

export default function ClientesCompacto() {
  const [clientes, setClientes] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false); // 👈 modal confirmación
  const [clienteToArchive, setClienteToArchive] = useState(null); // 👈 cliente seleccionado
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const navigate = useNavigate();
  const [showExportModal, setShowExportModal] = useState(false);
  // Estado para manejar los errores del formulario
  const [errores, setErrores] = useState({});
  const { setError } = useError();

  // filtros
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("Todos los estados");
  const [pagoFilter, setPagoFilter] = useState("Todos los métodos de pago");
  const [regimenFilter, setRegimenFilter] = useState("Todos los regímenes fiscales");

  const [exportFormat, setExportFormat] = useState("excel");
  const [exportFilter, setExportFilter] = useState("todos");

  const handleGuardar = () => {
    if (!usuarioAdmin || usuarioAdmin.role !== "admin") {
      setError("No tienes permisos para realizar esta acción.");
      return;
    }
  };

  const existeDuplicado = (cliente, lista) => {
    return lista.some((c) =>
      (c.nombre || "").toLowerCase() === (cliente.nombre || "").toLowerCase() ||
      (c.email || "").toLowerCase() === (cliente.email || "").toLowerCase() ||
      (c.rfc || "").toLowerCase() === (cliente.rfc || "").toLowerCase() ||
      (c.telefono || "") === (cliente.telefono || "")
    );
  };

  const handleExport = async () => {
    // Filtra los datos según el estado seleccionado
    let filteredClients = [...clientes];

    if (exportFilter === "activo") {
      filteredClients = filteredClients.filter((c) => c.estado === "Activo");
    } else if (exportFilter === "inactivo") {
      filteredClients = filteredClients.filter((c) => c.estado === "Inactivo");
    }

    if (exportFormat === "excel") {
      exportToExcel(filteredClients);
    } else if (exportFormat === "pdf") {
      exportToPDF(filteredClients);
    }
  };

  const getFormattedDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  const getFormattedDateTimeSlash = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const exportToExcel = (filteredClients) => {
    const data = filteredClients.map((cliente) => ({
      RFC: cliente.rfc || "",
      Nombre: cliente.nombre || "",
      Email: cliente.email || "",
      Estado: cliente.estado || "",
      Teléfono: cliente.telefono || "",
      "Régimen Fiscal": cliente.regimenFiscal || "",
      "Método de Pago": cliente.metodoPago || "",
      Notas: cliente.notas || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    const fileName = `clientes_${getFormattedDateTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const exportToPDF = (clientes) => {
    const doc2 = new jsPDF("p", "mm", "a4");
    const pageWidth = doc2.internal.pageSize.getWidth();
    const pageHeight = doc2.internal.pageSize.getHeight();

    // 🎨 Paleta de colores corporativa
    const verdePrincipal = [46, 125, 50]; // verde oscuro
    const verdeSecundario = [76, 175, 80]; // verde más brillante

    // 🕓 Fecha y hora formateadas
    const fechaHora = getFormattedDateTimeSlash(); // Ej: 16/10/2025 15:45
    const fileName = `clientes_${getFormattedDateTime()}.pdf`; // Ej: clientes_2025-10-16_15-45.pdf

    // 🏢 Encabezado con logo y nombre de empresa
    // 🏢 Encabezado solo en la primera página
    const addHeaderFirstPage = () => {
      try {
        doc2.addImage(logo, "PNG", 14, 10, 20, 20);
      } catch (error) {
        console.warn("⚠️ No se pudo cargar el logo:", error);
      }

      doc2.setFont("helvetica", "bold");
      doc2.setFontSize(18);
      doc2.setTextColor(...verdePrincipal);
      doc2.text("D-Conta & Fiscal +", pageWidth / 2, 18, { align: "center" });

      doc2.setFont("helvetica", "normal");
      doc2.setFontSize(10);
      doc2.setTextColor(60, 60, 60);
      doc2.text(`Generado el: ${fechaHora}`, 14, 35);

      // línea decorativa
      doc2.setDrawColor(...verdeSecundario);
      doc2.setLineWidth(0.8);
      doc2.line(14, 38, pageWidth - 14, 38);
    };

    // 📘 Pie de página con texto y numeración
    const addFooter = (pageNumber, totalPages) => {
      const footerY = pageHeight - 10;
      doc2.setFontSize(9);
      doc2.setTextColor(100);
      doc2.text("Reporte generado automáticamente por D-Conta & Fiscal +", 14, footerY);
      doc2.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, footerY, { align: "right" });
    };

    // 🧾 Contenido de la tabla
    const tableColumn = [
      "RFC",
      "Nombre",
      "Email",
      "Estado",
      "Teléfono",
      "Régimen Fiscal",
      "Método de Pago",
      "Notas",
    ];

    const tableRows = clientes.map((c) => [
      c.rfc || "",
      c.nombre || "",
      c.email || "",
      c.estado || "",
      c.telefono || "",
      c.regimenFiscal || "",
      c.metodoPago || "",
      c.notas || "",
    ]);

    // 🧩 Generar la tabla con estilo verde
    // 🧩 Generar tabla
    autoTable(doc2, {
      startY: 42,
      head: [tableColumn],
      body: tableRows,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: verdePrincipal,
        textColor: [255, 255, 255],
        halign: "center",
      },
      alternateRowStyles: { fillColor: [240, 255, 240] },
      didDrawPage: (data) => {
        const pageNumber = doc2.internal.getNumberOfPages();

        // Solo mostrar el encabezado completo en la primera página
        if (pageNumber === 1) {
          addHeaderFirstPage();
        }

        // Pie de página en todas las páginas
        addFooter(pageNumber, "{total_pages_count_string}");
      },
    });

    // 🧮 Reemplaza el marcador {total_pages_count_string} con el número total real
    if (typeof doc2.putTotalPages === "function") {
      doc2.putTotalPages("{total_pages_count_string}");
    }

    doc2.save(fileName);
  };

  // Estado del formulario
  const [formData, setFormData] = useState({
    nombre: "",
    email: "",
    telefono: "",
    estado: "Activo",
    rfc: "",
    regimenFiscal: "",
    notas: "",
    fechaCreacion: new Date().toLocaleDateString(),
  });

  // Cargar clientes desde Firestore
  useEffect(() => {
    const fetchClientes = async () => {
      const querySnapshot = await getDocs(collection(db, "clientes"));
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setClientes(data);
    };
    fetchClientes();
  }, []);

  // Manejar cambios en formulario
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Actualizar el formulario
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Limpiar error del campo si el usuario lo corrige
    setErrores((prev) => {
      const nuevosErrores = { ...prev };

      // Validaciones básicas al vuelo
      if (name === "nombre" && value.trim() !== "") delete nuevosErrores.nombre;
      if (name === "email" && validarEmail(value)) delete nuevosErrores.email;
      if (name === "telefono" && validarTelefono(value)) delete nuevosErrores.telefono;
      if (name === "rfc" && validarRFC(value)) delete nuevosErrores.rfc;

      return nuevosErrores;
    });
  };


  // 🧾 Validar RFC con formato oficial SAT
  const validarRFC = (rfc) => {
    const regex = /^([A-ZÑ&]{3,4})\d{6}([A-Z\d]{3})$/i;
    return regex.test(rfc.trim());
  };

  // ✉️ Validar formato de correo
  const validarEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  };

  // 📞 Validar formato de teléfono (solo dígitos, mínimo 8)
  const validarTelefono = (tel) => {
    const regex = /^[0-9]{8,15}$/;
    return regex.test(tel.trim());
  };

  // VALIDACIONES
  const validarFormulario = () => {
    const nuevosErrores = {};
    const { nombre, email, telefono, rfc } = formData;

    // 🔍 Validaciones
    if (!nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!email.trim()) nuevosErrores.email = "El correo electrónico es obligatorio.";
    else if (!validarEmail(email)) nuevosErrores.email = "El formato del correo no es válido.";

    if (!telefono.trim()) nuevosErrores.telefono = "El teléfono es obligatorio.";
    else if (!validarTelefono(telefono)) nuevosErrores.telefono = "Solo se permiten números (8–15 dígitos).";

    if (!rfc.trim()) nuevosErrores.rfc = "El RFC es obligatorio.";
    else if (!validarRFC(rfc)) nuevosErrores.rfc = "El RFC no tiene un formato válido.";

    // 🚫 Validar duplicados (excepto si se edita el mismo cliente)
    const duplicado = clientes.find(
      (c) =>
        (c.nombre.toLowerCase() === nombre.toLowerCase() ||
          c.email.toLowerCase() === email.toLowerCase() ||
          c.telefono === telefono ||
          c.rfc.toLowerCase() === rfc.toLowerCase()) &&
        (!editingCliente || c.id !== editingCliente.id)
    );

    if (duplicado) {
      if (duplicado.nombre.toLowerCase() === nombre.toLowerCase())
        nuevosErrores.nombre = "Ya existe un cliente con este nombre.";
      if (duplicado.email.toLowerCase() === email.toLowerCase())
        nuevosErrores.email = "Este correo ya está registrado.";
      if (duplicado.telefono === telefono)
        nuevosErrores.telefono = "Este teléfono ya está registrado.";
      if (duplicado.rfc.toLowerCase() === rfc.toLowerCase())
        nuevosErrores.rfc = "Este RFC ya está registrado.";
    }

    setErrores(nuevosErrores);
    return Object.keys(nuevosErrores).length === 0; // ✅ sin errores
  };

  // Guardar o actualizar cliente
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validarFormulario()) return;
    try {
      if (editingCliente) {
        const docRef = doc(db, "clientes", editingCliente.id);
        await updateDoc(docRef, formData);
        setClientes(
          clientes.map((c) =>
            c.id === editingCliente.id ? { ...c, ...formData } : c
          )
        );
      } else {
        const docRef = await addDoc(collection(db, "clientes"), formData);
        setClientes([...clientes, { id: docRef.id, ...formData }]);
      }

      setShowModal(false);
      setEditingCliente(null);
      setFormData({
        nombre: "",
        email: "",
        telefono: "",
        estado: "Activo",
        rfc: "",
        regimenFiscal: "",
        notas: "",
        fechaCreacion: new Date().toLocaleDateString(),
      });
    } catch (error) {
      if (error.code === "permission-denied") {
        setError("🚫 No tienes permisos para realizar esta acción.");
      }
      console.error("Error al guardar cliente:", error);
    }
  };

  // Abrir modal de confirmación antes de inactivar
  const handleDelete = (cliente) => {
    setClienteToArchive(cliente);
    setShowConfirm(true);
  };

  const confirmArchive = async () => {
    if (!clienteToArchive) return;
    try {
      const clienteRef = doc(db, "clientes", clienteToArchive.id);
      await updateDoc(clienteRef, { estado: "Inactivo" });
      setClientes(
        clientes.map((c) =>
          c.id === clienteToArchive.id ? { ...c, estado: "Inactivo" } : c
        )
      );
      setShowConfirm(false);
      setClienteToArchive(null);
    } catch (error) {
      if (error.code === "permission-denied") {
        setError("🚫 No tienes permisos para realizar esta acción.");
      }
      console.error("Error al archivar cliente:", error);
    }
  };
  // 📥 Importar Excel
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        let nuevosClientes = [];
        let duplicados = [];

        rows.forEach((row) => {
          const cliente = {
            nombre: 
              row.Nombre || 
              row.nombre || 
              "",
            email: 
              row.Email || 
              row.email ||
              row.correo || 
              "",
            telefono:
              row.Teléfono ||
              row.Telefono ||
              row.telefono ||
              "",
            rfc: row.RFC || row.rfc || "",
            regimenFiscal:
              row["Régimen Fiscal"] ||
              row["Regimen Fiscal"] ||
              row.regimenFiscal ||
              "",
            estado: row.Estado || row.estado || "Activo",
            notas: row.Notas || row.notas || "",
            fechaCreacion: new Date().toLocaleDateString(),
          };


          // 🔍 Validar duplicados SOLO por nombre, email, rfc o teléfono
          const existe =
            existeDuplicado(cliente, clientes) ||
            existeDuplicado(cliente, nuevosClientes);

          if (existe) {
            duplicados.push(cliente);
          } else {
            nuevosClientes.push(cliente);
          }
        });

        // Guardar solo los válidos
        for (const cliente of nuevosClientes) {
          await addDoc(collection(db, "clientes"), cliente);
        }

        setClientes([...clientes, ...nuevosClientes]);

        // 🔔 Mensajes claros
        if (nuevosClientes.length > 0) {
          toast.success(`✅ ${nuevosClientes.length} clientes importados correctamente`);
        }

        if (duplicados.length > 0) {
          toast.warning(
            `⚠️ ${duplicados.length} registros fueron omitidos por estar duplicados`
          );
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Error al importar:", error);
      toast.error("Error al importar el archivo");
    }
  };



  // abrir modal en modo edición
  const handleEdit = (cliente) => {
    setEditingCliente(cliente);
    setFormData(cliente);
    setShowModal(true);
  };
  // abrir modal para ver detalles de los clientes
  const handleView = (cliente) => {
    setSelectedCliente(cliente);
    setShowDetails(true);
  };


  // 📤 Exportar clientes filtrados a Excel
  const handleExportExcel = () => {
    try {
      if (filteredClientes.length === 0) {
        //alert("No hay datos para exportar.");
        toast.info("No hay datos para exportar");
        return;
      }

      // Crea un arreglo con solo los campos básicos
      const exportData = filteredClientes.map((c) => ({
        Nombre: c.nombre,
        RFC: c.rfc,
        Email: c.email,
        Estado: c.estado,
        Teléfono: c.telefono || "",
        RégimenFiscal: c.regimenFiscal || "",
        MétodoPago: c.metodoPago || "",
        FechaCreación: c.fechaCreacion || "",
      }));

      // Crea la hoja y el libro
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

      // Exporta el archivo
      XLSX.writeFile(workbook, "clientes_exportados.xlsx");
    } catch (error) {
      console.error("Error al exportar Excel:", error);
    }
  };

  // Aplicar filtros
  const filteredClientes = clientes
    .filter((c) => {
      return (
        (search === "" ||
          c.nombre?.toLowerCase().includes(search.toLowerCase()) ||
          c.email?.toLowerCase().includes(search.toLowerCase()) ||
          c.rfc?.toLowerCase().includes(search.toLowerCase())) &&
        (estadoFilter === "Todos los estados" || c.estado === estadoFilter) &&
        (pagoFilter === "Todos los métodos de pago" || c.metodoPago === pagoFilter) &&
        (regimenFilter === "Todos los regímenes fiscales" || c.regimenFiscal === regimenFilter)
      );
    })
    // 👇 Ordenar: primero activos, luego inactivos
    .sort((a, b) => (a.estado === "Inactivo") - (b.estado === "Inactivo"));

  // Paginación
  const totalPages = Math.ceil(filteredClientes.length / entriesPerPage);
  const indexOfLast = currentPage * entriesPerPage;
  const indexOfFirst = indexOfLast - entriesPerPage;
  const currentClientes = filteredClientes.slice(indexOfFirst, indexOfLast);

  return (
    <>
    <Navbar/>
      <Container fluid className="bg-light min-vh-100 p-4">
        {/* Encabezado */}
        <header className="d-flex justify-content-between align-items-center mb-4">
          <div className="d-flex align-items-center gap-3">
            <Button variant="outline-secondary" onClick={() => navigate("/dashboard")}>
              <ArrowLeft size={18} /> Volver
            </Button>
            <div>
              <h2 className="fw-bold">Gestión de Clientes</h2>
              <p className="text-muted">Gestionar la información del cliente y los datos fiscales</p>
            </div>
          </div>

          <div className="d-flex gap-2">
            {/* Botón Importar */}
            <Button
              variant="outline-dark" className="d-flex align-items-center gap-2"
              onClick={() => document.getElementById("fileInputExcel").click()}
            >
              <Download size={16} /> Importar
            </Button>
            <input
              type="file"
              id="fileInputExcel"
              accept=".xlsx, .xls"
              onChange={handleImportExcel}
              style={{ display: "none" }}
            />
            {/* Botón que abre la ventana modal */}
            <Button
              variant="outline-dark"
              className="d-flex align-items-center gap-2"
              onClick={() => setShowExportModal(true)}
            >
              <Download size={16} /> Exportar
            </Button>

            <Button
              variant="dark"
              className="d-flex align-items-center gap-2"
              onClick={() => {
                setEditingCliente(null);
                setFormData({
                  nombre: "",
                  email: "",
                  telefono: "",
                  estado: "Activo",
                  rfc: "",
                  regimenFiscal: "",
                  notas: "",
                  fechaCreacion: new Date().toLocaleDateString(),
                });
                setShowModal(true);
              }}
            >
              <Plus size={16} className="me-2" /> Agregar cliente
            </Button>
          </div>
        </header>

        {/* Filtros */}
        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <h6 className="fw-bold">Filtros</h6>
          <Row className="g-3">
            <Col md={3}>
              <Form.Control
                type="text"
                placeholder="Busca por nombre, correo electrónico o RFC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Col>
            <Col md={3}>
              <Form.Select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
              >
                <option>Todos los estados</option>
                <option>Activo</option>
                <option>Inactivo</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Select
                value={regimenFilter}
                onChange={(e) => setRegimenFilter(e.target.value)}
              >
                <option>Todos los regímenes fiscales</option>
                <option>Actividad empresarial</option>
                <option>Plataformas digitales</option>
                <option>Enredamiento</option>
                <option>Incorporación fiscal</option>
                <option>Simplificado de confianza</option>
                <option>Personas morales</option>
              </Form.Select>
            </Col>
            <Col md={3}>
              <div className="ms-auto d-flex align-items-center gap-2">
                <Form.Label className="mb-0 text-muted">Mostrar</Form.Label>
                <Form.Select
                  value={entriesPerPage}
                  onChange={(e) => {
                    setEntriesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ width: "80px" }}
                >
                  <option>5</option>
                  <option>10</option>
                  <option>25</option>
                </Form.Select>
                <span className="text-muted">registros</span>
              </div>
            </Col>
          </Row>
        </div>

        {/* Tabla */}
        <div className="bg-white p-3 rounded shadow-sm mb-4">
          <Table hover responsive className="align-middle">
            <thead className="table-success">
              <tr>
                <th>Cliente</th>
                <th>RFC</th>
                <th>Email</th>
                <th>Estado</th>
                <th className="text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {currentClientes.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-4">
                    No hay clientes disponibles.
                  </td>
                </tr>
              ) : (
                currentClientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.rfc}</td>
                    <td>{c.email}</td>
                    <td>
                      <Badge bg={c.estado === "Activo" ? "success" : "secondary"}>
                        {c.estado}
                      </Badge>
                    </td>
                    <td className="text-center">
                      <div className="d-flex justify-content-center gap-2">
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleView(c)}
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => handleEdit(c)}
                        >
                          <Edit size={14} />
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
          {/* Paginación */}
          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-muted">
              Mostrando {indexOfFirst + 1} a{" "}
              {Math.min(indexOfLast, filteredClientes.length)} de {filteredClientes.length} registros
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
      </Container>

      {/* "Editar Cliente" : "Nuevo Cliente"n */}
      <Offcanvas
        show={showModal}
        onHide={() => setShowModal(false)}
        placement="end"
        backdrop="static"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>
            {editingCliente ? "Editar Cliente" : "Nuevo Cliente"}
          </Offcanvas.Title>
        </Offcanvas.Header>

        <Offcanvas.Body>
          <Form onSubmit={handleSubmit}>
            {/* TODO tu formulario igual */}
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Nombre completo</Form.Label>
                  <Form.Control
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleChange}
                    isInvalid={!!errores.nombre}
                    onBlur={validarFormulario}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errores.nombre}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Correo electrónico</Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    isInvalid={!!errores.email}
                    onBlur={validarFormulario}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errores.email}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Teléfono</Form.Label>
                  <Form.Control
                    type="text"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    isInvalid={!!errores.telefono}
                    onBlur={validarFormulario}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errores.telefono}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Estatus</Form.Label>
                  <Form.Select name="estado" value={formData.estado} onChange={handleChange}>
                    <option>Activo</option>
                    <option>Inactivo</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>RFC</Form.Label>
                  <Form.Control
                    type="text"
                    name="rfc"
                    value={formData.rfc}
                    onChange={handleChange}
                    isInvalid={!!errores.rfc}
                    onBlur={validarFormulario}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errores.rfc}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Régimen Fiscal</Form.Label>
                  <Form.Select
                    name="regimenFiscal"
                    value={formData.regimenFiscal}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Seleccionar</option>
                    <option>Actividad empresarial</option>
                    <option>Ágapes</option>
                    <option>Arrendamiento</option>
                    <option>Incorporación fiscal</option>
                    <option>Personas morales</option>
                    <option>Plataformas digitales</option>
                    <option>Simplificado de confianza</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Notas</Form.Label>
              <Form.Control
                as="textarea"
                name="notas"
                value={formData.notas}
                onChange={handleChange}
              />
            </Form.Group>
            <div className="d-grid gap-2 mt-3">
              <Button type="submit" variant="success" disabled={Object.keys(errores).length > 0}>
                {editingCliente ? "Guardar Cambios" : "Crear Cliente"}
              </Button>
              <Button variant="outline-secondary" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
            </div>
          </Form>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Modal Confirmación */}
      <ToastContainer
        position="top-center"
        className="mt-5"
      >
        <Toast show={showConfirm} onClose={() => setShowConfirm(false)}>
          <Toast.Header>
            <strong className="me-auto">Confirmar acción</strong>
          </Toast.Header>
          <Toast.Body>
            ¿Deseas marcar a <strong>{clienteToArchive?.nombre}</strong> como
            <b> Inactivo</b>?
            <div className="d-flex justify-content-end gap-2 mt-3">
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="danger" onClick={confirmArchive}>
                Confirmar
              </Button>
            </div>
          </Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Modal Detalles del Cliente */}
      <Offcanvas
        show={showDetails}
        onHide={() => setShowDetails(false)}
        placement="end"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Detalles del Cliente</Offcanvas.Title>
        </Offcanvas.Header>

        <Offcanvas.Body>
          {selectedCliente ? (
            <>
              <h4 className="fw-bold text-success">{selectedCliente.nombre}</h4>

              <Badge
                bg={selectedCliente.estado === "Activo" ? "success" : "secondary"}
                className="mb-3"
              >
                {selectedCliente.estado}
              </Badge>

              <Row className="mb-3">
                <Col md={6}>
                  <p><strong>Email:</strong> {selectedCliente.email}</p>
                  <p><strong>Teléfono:</strong> {selectedCliente.telefono}</p>
                  <p><strong>RFC:</strong> {selectedCliente.rfc}</p>
                  <p><strong>Régimen Fiscal:</strong> {selectedCliente.regimenFiscal}</p>
                  <p><strong>Fecha de creación:</strong> {selectedCliente.fechaCreacion}</p>
                </Col>
              </Row>

              {selectedCliente.notas && (
                <>
                  <strong>Notas</strong>
                  <p className="text-muted">{selectedCliente.notas}</p>
                </>
              )}
            </>
          ) : (
            <p className="text-muted">Cargando datos…</p>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      {/* Modal de exportación */}
      <Offcanvas
        show={showExportModal}
        onHide={() => setShowExportModal(false)}
        placement="end"
        className="offcanvas-export"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Exportar datos</Offcanvas.Title>
        </Offcanvas.Header>

        <Offcanvas.Body>
          <p className="text-muted mb-4">
            Configura tus ajustes de exportación.
          </p>

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

            <Form.Group className="mb-4">
              <Form.Label>Estado del cliente</Form.Label>
              <Form.Select
                value={exportFilter}
                onChange={(e) => setExportFilter(e.target.value)}
              >
                <option value="todos">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </Form.Select>
            </Form.Group>

            <div className="d-grid gap-2">
              <Button
                variant="dark"
                onClick={() => {
                  handleExport();
                  setShowExportModal(false);
                }}
              >
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

    </>
  );
}
