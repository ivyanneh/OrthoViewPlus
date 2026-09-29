import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { formatDicomDate, formatStudyModalities, formatValue } from '../utils/format.js';

const comparisonFields = [
  { label: 'Study Date', getValue: (profile) => profile?.studyDate },
  { label: 'Modality', getValue: (profile) => profile?.primarySeries?.modality },
  { label: 'Study Description', getValue: (profile) => profile?.studyDescription },
  { label: 'Series Description', getValue: (profile) => profile?.primarySeries?.seriesDescription },
  { label: 'Slice Thickness', getValue: (profile) => profile?.primaryInstance?.sliceThickness },
  { label: 'kVp', getValue: (profile) => profile?.primaryInstance?.kvp },
  { label: 'Tube Current / mA', getValue: (profile) => profile?.primaryInstance?.tubeCurrent },
  { label: 'Reconstruction Algorithm', getValue: (profile) => profile?.primaryInstance?.reconstructionAlgorithm },
  { label: 'Patient ID', getValue: (profile) => profile?.patientId },
  { label: 'Study ID', getValue: (profile) => profile?.studyId },
  { label: 'Series Number', getValue: (profile) => profile?.primarySeries?.seriesNumber },
  { label: 'Series Count', getValue: (profile) => profile?.seriesCount },
  { label: 'Exposure Index', getValue: (profile) => profile?.primaryInstance?.exposureIndex },
  { label: 'Target Exposure Index', getValue: (profile) => profile?.primaryInstance?.targetExposureIndex },
  { label: 'Deviation Index', getValue: (profile) => profile?.primaryInstance?.deviationIndex },
];

function StudyOption({ study }) {
  return (
    <option value={study.id}>
      {formatDicomDate(study.studyDate)} | {formatValue(study.studyDescription)} | {formatValue(study.patientId)}
    </option>
  );
}

function ProfileCard({ title, profile }) {
  return (
    <article className="comparison-card">
      <div className="comparison-card-header">
        <p className="comparison-kicker">{title}</p>
        <h3>{formatValue(profile?.studyDescription)}</h3>
      </div>
      <dl className="comparison-meta">
        <div>
          <dt>Study Date</dt>
          <dd>{formatDicomDate(profile?.studyDate)}</dd>
        </div>
        <div>
          <dt>Patient ID</dt>
          <dd>{formatValue(profile?.patientId)}</dd>
        </div>
        <div>
          <dt>Study ID</dt>
          <dd>{formatValue(profile?.studyId)}</dd>
        </div>
        <div>
          <dt>Modalities</dt>
          <dd>{formatStudyModalities(profile?.modalitiesInStudy)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function CompareScans() {
  const [studies, setStudies] = useState([]);
  const [selectedLeft, setSelectedLeft] = useState('');
  const [selectedRight, setSelectedRight] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loadingStudies, setLoadingStudies] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState('');
  const [studySearch, setStudySearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadStudies() {
      setLoadingStudies(true);
      setError('');
      try {
        const response = await api.get('/compare/studies');
        if (!cancelled) {
          setStudies(response.data.studies || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Unable to load studies for comparison.');
          setStudies([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingStudies(false);
        }
      }
    }

    loadStudies();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredStudies = useMemo(() => {
    const needle = studySearch.trim().toLowerCase();
    if (!needle) {
      return studies;
    }

    return studies.filter((study) =>
      [study.studyDate, study.studyDescription, study.patientId, study.studyId, study.modalitiesInStudy]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [studySearch, studies]);

  async function handleCompare() {
    if (!selectedLeft || !selectedRight || selectedLeft === selectedRight) {
      setError('Select two different studies to compare.');
      return;
    }

    setLoadingComparison(true);
    setError('');
    try {
      const response = await api.get('/compare/compare', {
        params: {
          leftStudyId: selectedLeft,
          rightStudyId: selectedRight,
        },
      });
      setComparison(response.data.comparison);
    } catch (err) {
      setComparison(null);
      setError(err.response?.data?.error || 'Unable to compare the selected studies.');
    } finally {
      setLoadingComparison(false);
    }
  }

  const leftProfile = comparison?.left;
  const rightProfile = comparison?.right;

  return (
    <section>
      <header className="page-header">
        <h2>Compare Scans</h2>
        <p>Compare study metadata side by side. This module focuses on acquisition details rather than image rendering.</p>
      </header>

      {loadingStudies ? <LoadingState message="Loading available studies..." /> : null}
      <ErrorMessage message={error} />

      <div className="panel comparison-controls">
        <div className="field inline-field">
          <label htmlFor="study-search">Search studies</label>
          <input
            id="study-search"
            value={studySearch}
            onChange={(event) => setStudySearch(event.target.value)}
            placeholder="Search by study date, description, or patient ID"
          />
        </div>
        <div className="field inline-field">
          <label htmlFor="left-study">First study</label>
          <select id="left-study" value={selectedLeft} onChange={(event) => setSelectedLeft(event.target.value)}>
            <option value="">Select a study</option>
            {filteredStudies.map((study) => (
              <StudyOption key={study.id} study={study} />
            ))}
          </select>
        </div>
        <div className="field inline-field">
          <label htmlFor="right-study">Second study</label>
          <select id="right-study" value={selectedRight} onChange={(event) => setSelectedRight(event.target.value)}>
            <option value="">Select a study</option>
            {filteredStudies.map((study) => (
              <StudyOption key={study.id} study={study} />
            ))}
          </select>
        </div>
        <button type="button" className="primary-button compare-button" onClick={handleCompare} disabled={loadingComparison}>
          {loadingComparison ? 'Comparing...' : 'Compare Selected Studies'}
        </button>
      </div>

      {comparison ? (
        <>
          <div className="comparison-grid">
            <ProfileCard title="Study A" profile={leftProfile} />
            <ProfileCard title="Study B" profile={rightProfile} />
          </div>
          <div className="panel section-panel">
            <div className="section-heading">
              <h3>Metadata Comparison</h3>
              <p>No clinical conclusion is generated. Missing values are shown as unavailable.</p>
            </div>
            <div className="table-wrap">
              <table className="data-table comparison-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Study A</th>
                    <th>Study B</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFields.map((field) => (
                    <tr key={field.label}>
                      <th scope="row">{field.label}</th>
                      <td>{formatValue(field.getValue(leftProfile))}</td>
                      <td>{formatValue(field.getValue(rightProfile))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          Select two studies, then run the comparison to review side-by-side metadata.
        </div>
      )}
    </section>
  );
}

