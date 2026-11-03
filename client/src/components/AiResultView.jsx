import { useEffect, useState } from 'react';
import api from '../api/client.js';
import MeshViewer from './MeshViewer.jsx';

function AuthorizedImage({ url, label }) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setSource('');
    setError('');
    api.get(url, { responseType: 'blob' }).then(({ data }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(data);
      setSource(objectUrl);
    }).catch(() => {
      if (active) setError('Unable to load this authorized AI result image.');
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (error) return <p role="alert">{error}</p>;
  return source ? <img src={source} alt={label} /> : <p>Loading AI image...</p>;
}

export default function AiResultView({ result }) {
  const metadata = result.metadata || {};
  const apiUrl = (url) => url.replace(/^\/api(?=\/)/, '');
  return (
    <article className="ai-result-card">
      <h4>{result.label} · {result.reviewStatus === 'reviewed' ? 'Reviewed' : 'Pending review'}</h4>
      {metadata.synthetic ? <p className="synthetic-banner">SYNTHETIC OUTPUT — NOT A PATIENT EXAMINATION</p> : null}
      {metadata.experimental ? <p className="synthetic-banner">EXPERIMENTAL OUTPUT — REQUIRES RADIOLOGIST REVIEW</p> : null}
      {result.resultKind?.endsWith('_rejected') || result.resultKind?.endsWith('_failed')
        ? <p role="status">Processing did not produce an accepted result. Review the warnings below.</p>
        : null}
      {result.resultKind === 'anatomical_3d' && result.fileUrl
        ? <MeshViewer url={apiUrl(result.fileUrl)} label={result.label} />
        : result.fileUrl ? <AuthorizedImage url={apiUrl(result.fileUrl)} label={result.label} /> : null}
      {result.overlayUrl ? <AuthorizedImage url={apiUrl(result.overlayUrl)} label={`${result.label} overlay`} /> : null}
      {metadata.warnings?.length ? (
        <ul className="ai-result-warnings">{metadata.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
      ) : null}
      {metadata.metrics ? <details><summary>Processing details</summary><pre>{JSON.stringify(metadata.metrics, null, 2)}</pre></details> : null}
    </article>
  );
}
