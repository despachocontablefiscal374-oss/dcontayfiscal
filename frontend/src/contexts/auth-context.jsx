// src/contexts/auth-context.js
import { createContext, useContext, useState } from "react"

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState({ name: "Geraldin", role: "admin" })

  const logout = async () => {
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext); // <- punto y coma
