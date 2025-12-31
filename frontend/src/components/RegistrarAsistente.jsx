import React, { useState, useEffect } from "react";
import { Button, Table, Modal, Toast, Form, Row, Col, Badge, Container, Offcanvas } from "react-bootstrap";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { auth, db, functions } from "../firebaseConfig"; // Asegúrate de tu import correcto
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Edit, Trash2, ArrowLeft, Key, Plus } from "lucide-react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import Navbar from "./Navbar";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";


export default function RegistrarAsistente() {
    const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, "");

    const navigate = useNavigate();
    const [asistentes, setAsistentes] = useState([]);
    const [formData, setFormData] = useState({
        nombreUsuario: "",
        correo: "",
        role: "",
        activo: true,
        password: "",
    });
    const [showModal, setShowModal] = useState(false);
    const [editingAsistente, setEditingAsistente] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const [selectedAsistente, setSelectedAsistente] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Cargar asistentes
    useEffect(() => {
        const fetchAsistentes = async () => {
            const res = await fetch(`${API_URL}/api/usuarios`);
            const data = await res.json();
            setAsistentes(data);
        };
        fetchAsistentes();
    }, []);


    // Manejar cambios en formulario
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData({
            ...formData,
            [name]: type === "checkbox" ? checked : value,
        });
    };

    // Guardar o actualizar asistente
    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            if (editingAsistente) {
                // EDITAR
                await fetch(`${API_URL}/api/usuarios`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...formData,
                        uid: editingAsistente.id,
                    }),
                });

            } else {
                // CREAR
                await fetch(`${API_URL}/api/usuarios`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData),
                });
            }

            setShowModal(false);
            setEditingAsistente(null);
            setFormData({
                nombreUsuario: "",
                correo: "",
                role: "asistente",
                activo: true,
                password: "",
            });

            // Recargar tabla
            const res = await fetch(`${API_URL}/api/usuarios`);
            setAsistentes(await res.json());
        } catch (error) {
            toast.error("Error al guardar usuario");
            //alert("Error al guardar usuario");
        }
    };

    // Editar asistente
    const handleEdit = (asistente) => {
        setEditingAsistente(asistente);
        setFormData(asistente);
        setShowModal(true);
    };

    const confirmDeleteToast = (onConfirm) => {
        const toastId = toast(
            ({ }) => (
            <div>
                <strong className="d-block mb-2">Eliminar usuario</strong>
                <span>¿Eliminar usuario definitivamente?</span>

                <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => toast.dismiss(toastId)}
                >
                    Cancelar
                </button>

                <button
                    className="btn btn-sm btn-danger"
                    onClick={async () => {
                    toast.dismiss(toastId); // ✅ cerrar primero (seguro)
                    await onConfirm();      // luego ejecutar acción
                    }}
                >
                    Confirmar
                </button>
                </div>
            </div>
            ),
            {
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            closeButton: false,
            position: "top-center",
            }
        );
    };



    // Eliminar asistente
    const handleDelete = (uid) => {
        confirmDeleteToast(async () => {
            try {
            await fetch(`${API_URL}/api/usuarios?uid=${uid}`, {
                method: "DELETE",
            });

            setAsistentes((prev) => prev.filter((a) => a.id !== uid));
            toast.success("Usuario eliminado correctamente");
            } catch (error) {
            toast.error("Error al eliminar usuario");
            }
        });
    };

    // Ver detalles
    const handleView = (asistente) => {
        setSelectedAsistente(asistente);
        setShowDetails(true);
    };

    // Restablecer contraseña (solo visual, ejemplo)
    const handleResetPassword = async () => {
        if (!editingAsistente) return;

        try {
            await sendPasswordResetEmail(auth, editingAsistente.correo);

            toast.success(
                `📧 Correo de restablecimiento enviado a ${editingAsistente.correo}`
            );
        } catch (error) {
            console.error(error);

            toast.error(
                "❌ No se pudo enviar el correo. Verifica que el correo esté registrado en Firebase."
            );
        }
    };

    return (
        <>
            <Navbar />
            {/* 🔹 Contenedor principal igual que en ClientesCompacto */}
            <Container fluid className="dashboard-container fade-in">
                {/* Encabezado */}
                <header className="d-flex justify-content-between align-items-center mb-4">
                    <div className="d-flex align-items-center gap-3">
                        <Button variant="outline-secondary" onClick={() => navigate("/dashboard")}>
                            <ArrowLeft size={18} /> Volver
                        </Button>
                        <div>
                            <h2 className="fw-bold">Gestión de Asistentes</h2>
                            <p className="text-muted mb-0">Registrar, editar o eliminar asistentes del despacho</p>
                        </div>
                    </div>
                    <Button
                        variant="outline-success"
                        onClick={() => {
                            setEditingAsistente(null); // 👈 LIMPIA MODO EDICIÓN
                            setFormData({
                                nombreUsuario: "",
                                correo: "",
                                role: "asistente",
                                activo: true,
                                password: "",
                            });
                            setShowModal(true);
                        }}
                    >
                        + Nuevo Asistente
                    </Button>
                </header>

                {/* Tabla de asistentes */}
                <div className="bg-white p-3 rounded shadow-sm">
                    <Table hover responsive className="align-middle">
                        <thead className="table-success">
                            <tr>
                                <th>Nombre</th>
                                <th>Correo</th>
                                <th>Rol</th>
                                <th>Activo</th>
                                <th className="text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {asistentes.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center text-muted py-4">
                                        No hay asistentes registrados.
                                    </td>
                                </tr>
                            ) : (
                                asistentes.map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.nombreUsuario}</td>
                                        <td>{a.correo}</td>
                                        <td>{a.role}</td>
                                        <td>
                                            <Badge bg={a.activo ? "success" : "secondary"}>
                                                {a.activo ? "Activo" : "Inactivo"}
                                            </Badge>
                                        </td>
                                        <td className="text-center">
                                            <div className="d-flex justify-content-center gap-2">
                                                <Button
                                                    variant="outline-success"
                                                    size="sm"
                                                    onClick={() => handleView(a)}
                                                >
                                                    <Eye size={14} />
                                                </Button>
                                                <Button
                                                    variant="outline-primary"
                                                    size="sm"
                                                    onClick={() => handleEdit(a)}
                                                >
                                                    <Edit size={14} />
                                                </Button>
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    onClick={() => handleDelete(a.id)}
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
                </div>



                {/* Modal Detalles */}
                <Offcanvas
                    show={showDetails}
                    onHide={() => setShowDetails(false)}
                    placement="end"
                    className="offcanvas-asistente"
                >
                    <Offcanvas.Header closeButton>
                        <Offcanvas.Title>Detalles del Asistente</Offcanvas.Title>
                    </Offcanvas.Header>

                    <Offcanvas.Body>
                        {selectedAsistente ? (
                            <>
                                <p><strong>Nombre:</strong> {selectedAsistente.nombreUsuario}</p>
                                <p><strong>Correo:</strong> {selectedAsistente.correo}</p>
                                <p><strong>Rol:</strong> {selectedAsistente.role}</p>
                                <p><strong>Activo:</strong> {selectedAsistente.activo ? "Sí" : "No"}</p>

                                <div className="d-grid gap-2 mt-3">
                                    <Button
                                        variant="outline-secondary"
                                        size="sm"
                                        onClick={() => setShowDetails(false)}
                                    >
                                        Cerrar
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="text-muted">Cargando información…</p>
                        )}
                    </Offcanvas.Body>
                </Offcanvas>


                {/* "Editar Asistente" : "Nuevo Asistente" */}
                <Offcanvas
                    show={showModal}
                    onHide={() => setShowModal(false)}
                    placement="end"
                    backdrop="static"
                >
                    <Offcanvas.Header closeButton>
                        <Offcanvas.Title>
                            {editingAsistente ? "Editar Asistente" : "Nuevo Asistente"}
                        </Offcanvas.Title>
                    </Offcanvas.Header>

                    <Offcanvas.Body>
                        <Form onSubmit={handleSubmit}>
                            {/* TU FORM EXACTAMENTE IGUAL */}
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Nombre de Usuario</Form.Label>
                                        <Form.Control
                                            name="nombreUsuario"
                                            value={formData.nombreUsuario}
                                            onChange={handleChange}
                                            required
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Correo Electrónico</Form.Label>
                                        <Form.Control
                                            type="email"
                                            name="correo"
                                            value={formData.correo}
                                            onChange={handleChange}
                                            required
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>
                            <Row className="mb-3">
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Rol</Form.Label>
                                        <Form.Select
                                            name="role"
                                            value={formData.role}
                                            onChange={handleChange}
                                        >
                                            <option value="asistente">Asistente</option>
                                            <option value="admin">Administrador</option>
                                        </Form.Select>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group>
                                        <Form.Label>Contraseña</Form.Label>

                                        <div className="position-relative">
                                            <Form.Control
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                value={formData.password}
                                                onChange={handleChange}
                                                placeholder={
                                                    editingAsistente
                                                        ? "******"
                                                        : "Contraseña inicial"
                                                }
                                                required={!editingAsistente}
                                            />
                                            <Button
                                                variant="link"
                                                type="button"
                                                className="position-absolute top-50 end-0 translate-middle-y me-2 p-0"
                                                onClick={() => setShowPassword(!showPassword)}
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </Button>
                                        </div>
                                    </Form.Group>

                                </Col>
                            </Row>
                            <Form.Group className="mb-3">
                                <Form.Check
                                    type="checkbox"
                                    label="Activo"
                                    name="activo"
                                    checked={formData.activo}
                                    onChange={handleChange}
                                />
                            </Form.Group>
                            {editingAsistente && (
                                <Button
                                    variant="outline-warning"
                                    size="sm"
                                    className="mb-3"
                                    onClick={handleResetPassword}
                                >
                                    <Key size={14} className="me-2" />
                                    Enviar correo de restablecimiento
                                </Button>
                            )}
                            <Button type="submit" variant="success">
                                {editingAsistente ? "Guardar Cambios" : "Crear Asistente"}
                            </Button>
                        </Form>
                    </Offcanvas.Body>
                </Offcanvas>

                <ToastContainer
                    position="top-right"
                    autoClose={3000}
                    hideProgressBar={false}
                    newestOnTop
                    closeOnClick
                    pauseOnHover
                />

            </Container>
        </>
    );
}; 