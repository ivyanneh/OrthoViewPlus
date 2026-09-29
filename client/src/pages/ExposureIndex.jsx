import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { formatDicomDate, formatValue } from '../utils/format.js';

function ExposureTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Study Date</th>
            <th>Patient ID</th>
            <th>Study ID</th>
            <th>Study Description</th>
            <th>Series Description</th>
            <th>Modality</th>
            <th>Exposure Index</th>
            <th>Target Exposure Index</th>
            <th>Deviation Index</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDicomDate(row.studyDate)}</td>
              <td>{formatValue(row.patientId)}</td>
              <td>{formatValue(row.studyId)}</td>
              <td>{formatValue(row.studyDescription)}</td>
              <td>{formatValue(row.seriesDescription)}</td>
              <td>{formatValue(row.modality)}</td>
              <td>{formatValue(row.exposureIndex)}</td>
              <td>{formatValue(row.targetExposureIndex)}</td>
              <td>{formatValue(row.deviationIndex)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExposureIndex() {
  const [data, setData] = useState({ orthanc: null, rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modality, setModality] = useState('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/exposure');
        if (!cancelled) {
          setData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Unable to load exposure data.');
          setData({ orthanc: err.response?.data?.orthanc ?? null, rows: [] });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const modalities = useMemo(() => {
    const unique = new Set();
    for (const row of data.rows || []) {
      if (row.modality) {
        unique.add(row.modality);
      }
    }
    return Array.from(unique).sort();
  }, [data.rows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data.rows || []).filter((row) => {
      const matchesSearch =
        !needle ||
        [row.studyDate, row.patientId, row.studyId, row.studyDescription, row.seriesDescription, row.modality]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));

      const matchesModality = modality === 'all' || row.modality === modality;
      return matchesSearch && matchesModality;
    });
  }, [data.rows, modality, search]);

  const connected = Boolean(data.orthanc?.connected);

  return (
    <section>
      <header className="page-header">
        <h2>Exposure Index</h2>
        <p>Review exposure-related workflow metadata from Orthanc. Missing values remain marked as unavailable.</p>
      </header>

      {loading ? <LoadingState message="Loading exposure records..." /> : null}
      <ErrorMessage message={error} />

      <div className="panel status-panel">
        <div className="status-row">
          <span className={`badge ${connected ? 'badge-ok' : 'badge-warn'}`}>
            {connected ? 'Orthanc connected' : 'Orthanc unavailable'}
          </span>
          <span className="status-caption">
            {connected ? 'Exposure data is being retrieved through the backend.' : 'Unable to retrieve Orthanc data.'}
          </span>
        </div>
      </div>

      <div className="panel filter-panel">
        <div className="field inline-field">
          <label htmlFor="exposure-search">Search</label>
          <input
            id="exposure-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by study, patient ID, or modality"
          />
        </div>
        <div className="field inline-field">
          <label htmlFor="exposure-modality">Modality</label>
          <select id="exposure-modality" value={modality} onChange={(event) => setModality(event.target.value)}>
            <option value="all">All modalities</option>
            {modalities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length > 0 ? (
        <ExposureTable rows={filteredRows} />
      ) : (
        <div className="empty-state">
          {connected
            ? 'No exposure records matched the current filters or no exposure metadata exists in Orthanc.'
            : 'Orthanc data is unavailable. Connect Orthanc to review exposure metadata.'}
        </div>
      )}
    </section>
  );
}

