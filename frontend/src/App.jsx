import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <>
        <Routes>
          {!user ? (
            <Route path="*" element={<Login onLogin={handleLogin} />} />
          ) : (
            <>
              <Route
                path="/dashboard"
                element={
                  <Dashboard
                    onLogout={handleLogout}
                    role={user.rol}
                    user={user}
                  />
                }
              />

              {/* Solo ADMIN */}
              {user.rol === "admin" && (
                <Route
                  path="/registrar-asistente"
                  element={<RegistrarAsistente />}
                />
              )}

              <Route path="/panel" element={<Panel />} />
              <Route path="/pagos" element={<Pagos />} />
              <Route path="/recordatorios" element={<Recordatorios />} />
              <Route path="/clientes-compacto" element={<ClientesCompacto />} />

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
        </Routes>

        {/* 🔔 Toasts globales */}
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
        />
      </>
    </Router>
  );
}

export default App;
