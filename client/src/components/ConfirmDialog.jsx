import { useState } from 'react';
import ErrorMessage from './ErrorMessage.jsx';
import Modal from './Modal.jsx';
import { getApiError } from '../utils/format.js';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(getApiError(err, 'The action could not be completed.'));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      width={460}
      footer={
        <>
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={handleConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </>
      }
    >
      <ErrorMessage message={error} />
      <p className="modal-text">{message}</p>
    </Modal>
  );
}
