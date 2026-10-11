import { AlertIcon } from './Icons.jsx';

export default function ErrorMessage({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="error-banner" role="alert">
      <AlertIcon size={16} />
      <span>{message}</span>
    </div>
  );
}
