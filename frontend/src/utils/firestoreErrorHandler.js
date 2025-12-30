export function handleFirestoreError(error, setError) {
  if (error?.code === "permission-denied") {
    setError("🚫 No tienes permisos para realizar esta acción.");
  } else {
    setError("❌ Ocurrió un error inesperado. Intenta de nuevo.");
  }

  console.error(error);
}