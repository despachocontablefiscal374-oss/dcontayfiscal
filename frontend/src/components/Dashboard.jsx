import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Container, Row, Col, Badge } from "react-bootstrap";
import { LogOut, Users, CreditCard, Bell, FileText } from "lucide-react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
import Navbar from "./Navbar";

function Dashboard({ onLogout, role }) {
  const navigate = useNavigate();
  const [totalClientes, setTotalClientes] = useState(0);
  const [porcentajeInactivos, setPorcentajeInactivos] = useState(0);
  const [stats, setStats] = useState({
    totalPagado: 0,
    pagosPendientes: 0,
    pagosVencidos: 0,
    totalRegistros: 0,
    totalMes: 0,
  });

  // ---- CLIENTES ----
  useEffect(() => {
    const clientesRef = collection(db, "clientes");
    const unsubscribe = onSnapshot(clientesRef, (snapshot) => {
      const total = snapshot.size;
      let inactivos = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.estado && data.estado.toLowerCase() === "inactivo") {
          inactivos++;
        }
      });
      setTotalClientes(total);
      setPorcentajeInactivos(total > 0 ? ((inactivos / total) * 100).toFixed(1) : 0);
    });
    return () => unsubscribe();
  }, []);

  // ---- PAGOS (estadísticas en tiempo real) ----
  useEffect(() => {
    const pagosRef = collection(db, "pagos");
    const unsubscribe = onSnapshot(pagosRef, (snapshot) => {
      let totalPagado = 0;
      let pagosPendientes = 0;
      let pagosVencidos = 0;
      let totalRegistros = snapshot.size;
      let totalMes = 0;


      const hoy = new Date();
      const mesActual = hoy.toISOString().slice(0, 7); // "YYYY-MM"

      snapshot.forEach((doc) => {
        const data = doc.data();
        const monto = Number(data.monto) || 0;
        const estatus = (data.estatus || "").toLowerCase();

        // 🔹 TOTAL DEL MES
        if (data.mes === mesActual) {
          totalMes += monto;
        }

        // 🔹 CLASIFICACIÓN POR ESTATUS (SIN FECHA)
        if (estatus === "pagado") {
          totalPagado += monto;
          return;
        }

        if (estatus === "pendiente") {
          pagosPendientes += monto;
          return;
        }

        if (estatus === "vencido") {
          pagosVencidos += monto;
          return;
        }
      });

      setStats({
        totalPagado,
        pagosPendientes,
        pagosVencidos,
        totalRegistros,
        totalMes,
      });
    });

    return () => unsubscribe();

  }, []);

  const formatCurrency = (v) => {
    return Number(v || 0).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  };

  return (
    <>
    <Navbar onLogout={onLogout} role={role} />
      <Container fluid className="dashboard-container fade-in">
        <div className="dashboard-header">
          <div>
            <h2>Panel General</h2>
            <p>Bienvenido de nuevo, {role === "admin" ? "Administrador" : "Usuario"}</p>
          </div>
          <Badge className="dashboard-role">{role}</Badge>
        </div>

        {/* Estadísticas */}
        <Row className="g-4 mb-4">
          <Col md={3}>
            <Card
              className="stats-card dashboard-card h-100 border-0"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/clientes-compacto")}
            >
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6>Total de clientes</h6>
                    <h3>{totalClientes}</h3>
                    <small className="text-danger">{porcentajeInactivos}% inactivos</small>
                  </div>
                  <Users className="text-success" size={30} />
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stats-card dashboard-card h-100 border-0"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/pagos?filtro=pendientes")}
            >
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6>Pagos pendientes</h6>
                    <h3>{formatCurrency(stats.pagosPendientes)}</h3>
                    <small className="text-muted">
                      {stats.totalRegistros > 0
                        ? `${Math.round(
                          (stats.pagosPendientes / (stats.totalPagado + stats.pagosPendientes + stats.pagosVencidos)) *
                          100 || 0
                        )}% del total`
                        : "0% del total"}
                    </small>
                  </div>
                  <CreditCard className="text-success" size={30} />
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stats-card dashboard-card h-100 border-0"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/pagos?filtro=vencido")}
            >
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6>Pagos atrasados</h6>
                    <h3 className="text-danger">{formatCurrency(stats.pagosVencidos)}</h3>
                    <small className="text-danger">
                      {stats.pagosVencidos > 0
                        ? `${stats.pagosVencidos.toLocaleString("es-MX")} MXN vencidos`
                        : "Sin pagos vencidos"}
                    </small>
                  </div>
                  <Bell className="text-danger" size={30} />
                </div>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card
              className="stats-card dashboard-card h-100 border-0"
              style={{ cursor: "pointer" }}
              onClick={() => navigate("/pagos?filtro=mes")}
            >
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6>Este mes</h6>
                    <h3 className="text-primary">{formatCurrency(stats.totalMes)}</h3>
                    <small className="text-primary">
                      Total de pagos del mes actual
                    </small>
                  </div>
                  <FileText className="text-primary" size={30} />
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Apartados principales */}
        <Row className="g-4">
          <Col md={3}>
            <Card className="main-card dashboard-card text-center p-3">
              <Card.Body>
                <h5 className="fw-bold">Panel de análisis</h5>
                <p className="text-muted">Ver análisis detallados, gráficos e información empresarial</p>
                <Button onClick={() => navigate("/panel")}>Ir al panel</Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card className="main-card dashboard-card text-center p-3">
              <Card.Body>
                <h5 className="fw-bold">Gestión de clientes</h5>
                <p className="text-muted">Registre, vea y administre la información del cliente</p>
                <Button onClick={() => navigate("/clientes-compacto")}>Ir a clientes</Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card className="main-card dashboard-card text-center p-3">
              <Card.Body>
                <h5 className="fw-bold">Seguimiento de pagos</h5>
                <p className="text-muted">Registre pagos y gestione cronogramas de pago</p>
                <Button onClick={() => navigate("/pagos")}>Ir a pagos</Button>
              </Card.Body>
            </Card>
          </Col>

          <Col md={3}>
            <Card className="main-card dashboard-card text-center p-3">
              <Card.Body>
                <h5 className="fw-bold">Recordatorios</h5>
                <p className="text-muted">Configure recordatorios de pago automatizados</p>
                <Button onClick={() => navigate("/recordatorios")}>Ir a recordatorios</Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
}

export default Dashboard;
