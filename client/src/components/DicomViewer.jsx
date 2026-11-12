import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/client.js';
import LoadingState from './LoadingState.jsx';
import { formatDicomDate, formatValue } from '../utils/format.js';

export default function DicomViewer({ study, profile, seriesId, onSeriesChange }) {
  const series = profile?.series || [];
  const [internalSeriesId, setInternalSeriesId] = useState('');
  const [instanceIndex, setInstanceIndex] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [windowCenter, setWindowCenter] = useState('');
  const [windowWidth, setWindowWidth] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [invert, setInvert] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const activeSeriesId = seriesId || internalSeriesId;

  const selectedSeries = useMemo(
    () => series.find((item) => item.id === activeSeriesId) || series[0] || null,
    [series, activeSeriesId],
  );
  const instanceIds = selectedSeries?.instances || [];
  const instanceId = instanceIds[instanceIndex] || null;

  useEffect(() => {
    if (series.length && !series.some((item) => item.id === activeSeriesId)) {
      if (typeof onSeriesChange === 'function') {
        onSeriesChange(series[0].id);
      }
      setInternalSeriesId(series[0].id);
      setInstanceIndex(0);
    }
  }, [series, activeSeriesId, onSeriesChange]);

  useEffect(() => {
    if (!instanceId) {
      setImageUrl('');
      setError('');
      return undefined;
    }
    let active = true;
    let objectUrl = '';
    setLoading(true);
    setError('');
    api.get(`/imaging/instances/${encodeURIComponent(instanceId)}/rendered`, {
      responseType: 'blob',
      params: {
        windowCenter: windowCenter === '' ? undefined : windowCenter,
        windowWidth: windowWidth === '' ? undefined : windowWidth,
      },
    }).then(({ data }) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(data);
      setImageUrl(objectUrl);
    }).catch((requestError) => {
      if (!active) return;
      setImageUrl('');
      setError(requestError.response?.data?.error || 'Unable to load this authorized DICOM instance.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [instanceId, windowCenter, windowWidth]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setInvert(false);
    setPan({ x: 0, y: 0 });
  }, [instanceId]);

  function onPointerDown(event) {
    if (!imageUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(event) {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + event.clientX - drag.current.x,
      y: drag.current.panY + event.clientY - drag.current.y,
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div className="panel dicom-workstation">
      <div className="panel-header">
        <div>
          <h3>DICOM viewer</h3>
          <p>{formatValue(study?.patientMrn || study?.mrn)} · {formatValue(study?.studyDescription || study?.description)} · {formatDicomDate(study?.studyDate || study?.study_date)} · {formatValue(study?.modalitiesInStudy || study?.modality || selectedSeries?.modality)} · {formatValue(study?.studyStatus || study?.status)}</p>
        </div>
        <span className="viewer-slice-count">{instanceIds.length ? `${instanceIndex + 1} / ${instanceIds.length}` : 'No instances'}</span>
      </div>

      <div className="dicom-viewer-toolbar">
        <label>
          Series
          <select value={selectedSeries?.id || ''} onChange={(event) => {
            if (typeof onSeriesChange === 'function') {
              onSeriesChange(event.target.value);
            }
            setInternalSeriesId(event.target.value);
            setInstanceIndex(0);
          }}>
            {series.map((item, index) => (
              <option key={item.id} value={item.id}>
                {item.modality || 'Series'} {item.seriesNumber ? `#${item.seriesNumber}` : index + 1} · {(item.instances || []).length} images
              </option>
            ))}
          </select>
        </label>
        <label>
          Instance
          <input
            type="range"
            min="0"
            max={Math.max(instanceIds.length - 1, 0)}
            value={Math.min(instanceIndex, Math.max(instanceIds.length - 1, 0))}
            onChange={(event) => setInstanceIndex(Number(event.target.value))}
            disabled={instanceIds.length < 2}
          />
        </label>
        <label>
          Window center
          <input type="number" value={windowCenter} placeholder="Auto" onChange={(event) => setWindowCenter(event.target.value)} />
        </label>
        <label>
          Window width
          <input type="number" min="1" value={windowWidth} placeholder="Auto" onChange={(event) => setWindowWidth(event.target.value)} />
        </label>
        <div className="viewer-controls" aria-label="Image controls">
          <button type="button" className="secondary-button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}>− Zoom</button>
          <button type="button" className="secondary-button" onClick={() => setZoom((value) => Math.min(5, value + 0.25))}>+ Zoom</button>
          <button type="button" className="secondary-button" onClick={() => setRotation((value) => (value + 90) % 360)}>Rotate</button>
          <button type="button" className="secondary-button" onClick={() => setInvert((value) => !value)}>Invert</button>
          <button type="button" className="secondary-button" onClick={() => {
            setZoom(1);
            setRotation(0);
            setInvert(false);
            setPan({ x: 0, y: 0 });
            setWindowCenter('');
            setWindowWidth('');
          }}>Reset</button>
        </div>
      </div>

      <div
        className="dicom-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="DICOM image viewport; drag to pan"
      >
        {loading ? <LoadingState message="Loading image from Orthanc..." /> : null}
        {error ? <p className="dicom-viewer-error" role="alert">{error}</p> : null}
        {!loading && !error && !instanceId ? <p className="muted">No image instances are available in this series.</p> : null}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`DICOM instance ${instanceIndex + 1} of ${instanceIds.length}`}
            draggable="false"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              filter: invert ? 'invert(1)' : 'none',
            }}
          />
        ) : null}
      </div>
      <p className="muted">Original acquisition rendered by Orthanc. Drag to pan; use controls for zoom, rotation and window/level. The source DICOM remains unchanged.</p>
    </div>
  );
}