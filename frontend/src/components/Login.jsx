import { useState } from "react";
import { auth } from "../firebaseConfig"; // asegúrate de tener Firestore inicializado
import { signInWithEmailAndPassword } from "firebase/auth";
import logo from "../assets/logo.png";


export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const API_URL = import.meta.env.VITE_API_URL.replace(/\/$/, "");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // 1️⃣ Login Firebase Auth
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // 2️⃣ Obtener token
      const token = await user.getIdToken();
      //console.log("TOKEN:", token);

      // 3️⃣ Enviar token al BACKEND
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Error de autenticación");
        return;
      }

      // 4️⃣ Login exitoso (backend manda rol y uid)
      onLogin({
        token,
        rol: data.rol,
        uid: data.uid,
        nombreUsuario: data.nombreUsuario,
      });

    } catch (err) {
      console.error(err);
      setError("Error al iniciar sesión. Verifica tus credenciales.");
    }
  };

  return (
    <div className="login-background">
      <div className="login-container">
        {<img src={logo} alt="Logo" className="company-logo" />}
        
        
        <h2>Bienvenido D-Conta & Fiscal +</h2>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="login-input"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="login-input"
          />
          <button type="submit" className="login-button">
            Ingresar
          </button>
        </form>

        {error && <p className="error-message">{error}</p>}
        
        
        <div className="extra">

        </div>

        
      </div>
    </div>
  );
}