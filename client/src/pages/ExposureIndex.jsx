import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { SearchIcon } from '../components/Icons.jsx';
import { formatDicomDate, formatValue } from '../utils/format.js';

function IndexHeader({ abbr, label }) {
  return (
    <th className="num" title={label}>
      <span className="th-abbr">{abbr}</span>
      <span className="th-sub">{label}</span>
    </th>
  );
}

function ExposureTable({ rows }) {
  return (
    <div className="table-wrap flush">
      <table className="data-table">
        <thead>
          <tr>
            <th>Study Date</th>
            <th>Patient ID</th>
            <th>Study ID</th>
            <th>Study Description</th>
            <th>Series Description</th>
            <th>Modality</th>
            <IndexHeader abbr="EI" label="Exposure Index" />
            <IndexHeader abbr="EIT" label="Target Exposure Index" />
            <IndexHeader abbr="DI" label="Deviation Index" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="mono nowrap">{formatDicomDate(row.studyDate)}</td>
              <td className="mono">{formatValue(row.patientId)}</td>
              <td className="mono">{formatValue(row.studyId)}</td>
              <td>{formatValue(row.studyDescription)}</td>
              <td>{formatValue(row.seriesDescription)}</td>
              <td>
                <span className="modality-tag">{formatValue(row.modality)}</span>
              </td>
              <td className="num mono">{formatValue(row.exposureIndex)}</td>
              <td className="num mono">{formatValue(row.targetExposureIndex)}</td>
              <td className="num mono strong">{formatValue(row.deviationIndex)}</td>
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
  const totalRows = (data.rows || []).length;
  const filtersActive = search.trim() !== '' || modality !== 'all';

  return (
    <section className="page">
      {loading ? <LoadingState message="Loading exposure records..." /> : null}
      <ErrorMessage message={error} />

      <div className="status-strip">
        <div className="status-row">
          <StatusBadge tone={connected ? 'ok' : 'warn'}>
            {connected ? 'Orthanc connected' : 'Orthanc unavailable'}
          </StatusBadge>
          <span className="status-caption">
            {connected ? 'Exposure data is being retrieved through the backend.' : 'Unable to retrieve Orthanc data.'}
          </span>
        </div>
        <span className="status-caption">Missing DICOM values are shown as Unavailable.</span>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="field inline-field grow">
            <label htmlFor="exposure-search">Search</label>
            <div className="input-icon">
              <SearchIcon size={16} />
              <input
                id="exposure-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Study date, patient ID, study or series description, modality"
              />
            </div>
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
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSearch('');
              setModality('all');
            }}
            disabled={!filtersActive}
          >
            Clear filters
          </button>
        </div>

        <div className="panel-subheader">
          <span>
            Showing <strong>{filteredRows.length}</strong> of <strong>{totalRows}</strong> series records
          </span>
          <span className="legend">
            <span><abbr title="Exposure Index">EI</abbr> Exposure Index</span>
            <span><abbr title="Target Exposure Index">EIT</abbr> Target Exposure Index</span>
            <span><abbr title="Deviation Index">DI</abbr> Deviation Index</span>
          </span>
        </div>

        {filteredRows.length > 0 ? (
          <ExposureTable rows={filteredRows} />
        ) : (
          <div className="panel-body">
            <EmptyState
              title={connected ? 'No exposure records' : 'Orthanc data unavailable'}
              message={
                connected
                  ? 'No exposure records matched the current filters or no exposure metadata exists in Orthanc.'
                  : 'Orthanc data is unavailable. Connect Orthanc to review exposure metadata.'
              }
            />
          </div>
        )}
      </section>
    </section>
  );
}

