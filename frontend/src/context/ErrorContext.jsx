import { createContext, useContext, useState, useEffect } from "react";

const ErrorContext = createContext();

export const ErrorProvider = ({ children }) => {
  const [error, setError] = useState(null);

  // ⏱️ Auto ocultar después de 4 segundos
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <ErrorContext.Provider value={{ error, setError }}>
      {children}

      {error && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#dc3545",
            color: "white",
            padding: "12px 20px",
            borderRadius: "8px",
            zIndex: 9999,
            minWidth: "300px",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

    </ErrorContext.Provider>
  );
};

export const useError = () => useContext(ErrorContext);
