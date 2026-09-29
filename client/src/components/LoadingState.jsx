export default function LoadingState({ message = 'Loading...' }) {
  return (
    <p className="loading" role="status">
      {message}
    </p>
  );
}
