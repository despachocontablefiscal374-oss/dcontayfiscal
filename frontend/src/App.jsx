import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./components/Login";
import RegistrarAsistente from "./components/RegistrarAsistente";
import Dashboard from "./components/Dashboard";
import Panel from "./components/Panel";
import Pagos from "./components/Pagos";
import Recordatorios from "./components/Recordatorios";
import ClientesCompacto from "./components/ClientesCompacto";
import "bootstrap/dist/css/bootstrap.min.css";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function AppRoutes({ user, onLogin, onLogout }) {
  const location = useLocation();

  // 👉 Guarda la ruta si NO hay sesión
  useEffect(() => {
    if (!user && location.pathname !== "/") {
      localStorage.setItem("redirectAfterLogin", location.pathname);
    }
  }, [user, location]);

  if (!user) {
    return <Login onLogin={onLogin} />;
  }

  return (
    <Routes>
      <Route
        path="/dashboard"
        element={<Dashboard onLogout={onLogout} role={user.rol} user={user} />}
      />

      {user.rol === "admin" && (
        <Route path="/registrar-asistente" element={<RegistrarAsistente />} />
      )}

      <Route path="/panel" element={<Panel />} />
      <Route path="/pagos" element={<Pagos />} />
      <Route path="/recordatorios" element={<Recordatorios />} />
      <Route path="/clientes" element={<ClientesCompacto />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <Router>
      <AppRoutes user={user} onLogin={handleLogin} onLogout={handleLogout} />

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
      />
    </Router>
  );
}

export default App;
