import { toast } from "react-toastify";

export const confirmToast = (message, onConfirm, options = {}) => {
  toast(
    ({ closeToast }) => (
      <div>
        <p className="mb-2">{message}</p>
        <div className="d-flex justify-content-end gap-2">
          <button
            className="btn btn-sm btn-secondary"
            onClick={closeToast}
          >
            Cancelar
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              onConfirm();
              closeToast();
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
      ...options,
    }
  );
};
