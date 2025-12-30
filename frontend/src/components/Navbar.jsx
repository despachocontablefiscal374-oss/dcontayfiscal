import { useNavigate } from "react-router-dom";
import { LogOut, Users, Home, CreditCard, Bell, FileText } from "lucide-react";
import logo from "../assets/logo.png";
import "../index.css";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";

export default function Navbar({ role }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    // Limpia sesión o token si lo usas
    localStorage.removeItem("token");
    //navigate("/");
    window.location.reload(); // fuerza actualización visual
  };

  return (
    <nav className="custom-navbar shadow-lg px-4 py-2 d-flex align-items-center justify-content-between">
      <div className="d-flex align-items-center gap-3">
        <img src={logo} alt="Logo" className="navbar-logo" />
        <div className="navbar-title">
          <h4>D-Conta & Fiscal +</h4>
        </div>
      </div>

      <div className="d-flex align-items-center gap-3">
        <button onClick={() => navigate("/dashboard")} className="nav-btn">
          <Home size={18} /> Dashboard
        </button>

        <button onClick={() => navigate("/clientes-compacto")} className="nav-btn">
          <Users size={18} /> Clientes
        </button>

        <button onClick={() => navigate("/pagos")} className="nav-btn">
          <CreditCard size={18} /> Pagos
        </button>

        <button onClick={() => navigate("/recordatorios")} className="nav-btn">
          <Bell size={18} /> Recordatorios
        </button>

        <button onClick={() => navigate("/panel")} className="nav-btn">
          <FileText size={18} /> Panel
        </button>

        {role === "admin" && (
          <button onClick={() => navigate("/registrar-asistente")} className="nav-btn">
            <Users size={18} /> Registrar Asistente
          </button>
        )}

        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={18} /> Salir
        </button>
      </div>
    </nav>
  );
}