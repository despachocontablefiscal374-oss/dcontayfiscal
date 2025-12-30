import Navbar from "./NLayoutavbar";
import { Outlet } from "react-router-dom";

export default function Layout({ onLogout, role }) {
  return (
    <div className="app-layout">
      <Navbar onLogout={onLogout} role={role} />

      <div className="app-content">
        <Outlet />
      </div>

    </div>
  );
}
