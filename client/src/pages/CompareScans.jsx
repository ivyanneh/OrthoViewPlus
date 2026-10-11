import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { CompareIcon, ImageIcon, SearchIcon } from '../components/Icons.jsx';
import { formatDicomDate, formatStudyModalities, formatValue } from '../utils/format.js';

const comparisonGroups = [
  {
    title: 'Study',
    fields: [
      { label: 'Study Date', getValue: (profile) => profile?.studyDate },
      { label: 'Modality', getValue: (profile) => profile?.primarySeries?.modality },
      { label: 'Study Description', getValue: (profile) => profile?.studyDescription },
      { label: 'Series Description', getValue: (profile) => profile?.primarySeries?.seriesDescription },
      { label: 'Patient ID', getValue: (profile) => profile?.patientId },
      { label: 'Study ID', getValue: (profile) => profile?.studyId },
      { label: 'Series Number', getValue: (profile) => profile?.primarySeries?.seriesNumber },
      { label: 'Series Count', getValue: (profile) => profile?.seriesCount },
    ],
  },
  {
    title: 'Acquisition Parameters',
    fields: [
      { label: 'Slice Thickness', getValue: (profile) => profile?.primaryInstance?.sliceThickness },
      { label: 'kVp', getValue: (profile) => profile?.primaryInstance?.kvp },
      { label: 'Tube Current / mA', getValue: (profile) => profile?.primaryInstance?.tubeCurrent },
      { label: 'Reconstruction Algorithm', getValue: (profile) => profile?.primaryInstance?.reconstructionAlgorithm },
    ],
  },
  {
    title: 'Exposure Indicators',
    fields: [
      { label: 'Exposure Index (EI)', getValue: (profile) => profile?.primaryInstance?.exposureIndex },
      { label: 'Target Exposure Index (EIT)', getValue: (profile) => profile?.primaryInstance?.targetExposureIndex },
      { label: 'Deviation Index (DI)', getValue: (profile) => profile?.primaryInstance?.deviationIndex },
    ],
  },
];

function isDifferent(left, right) {
  const a = formatValue(left, '');
  const b = formatValue(right, '');
  return a !== '' && b !== '' && a !== b;
}

function StudyOption({ study }) {
  return (
    <option value={study.id}>
      {formatDicomDate(study.studyDate)} | {formatValue(study.studyDescription)} | {formatValue(study.patientId)}
    </option>
  );
}

function StudyViewport({ label, profile }) {
  return (
    <article className="viewport">
      <header className="viewport-header">
        <span className="viewport-label">{label}</span>
        <span className="viewport-title">{profile ? formatValue(profile.studyDescription) : 'No study loaded'}</span>
      </header>
      <div className="viewport-canvas">
        {profile ? (
          <>
            <div className="viewport-overlay top-left">
              <span>ID: {formatValue(profile.patientId)}</span>
              <span>Study: {formatValue(profile.studyId)}</span>
            </div>
            <div className="viewport-overlay top-right">
              <span>{formatDicomDate(profile.studyDate)}</span>
              <span>{formatStudyModalities(profile.modalitiesInStudy)}</span>
            </div>
            <div className="viewport-overlay bottom-left">
              <span>{formatValue(profile.primarySeries?.seriesDescription)}</span>
            </div>
          </>
        ) : null}
        <div className="viewport-placeholder">
          <ImageIcon size={30} />
          <span>{profile ? 'Image rendering not available — metadata only' : 'Select a study to load'}</span>
        </div>
      </div>
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
    <section className="page">
      {loadingStudies ? <LoadingState message="Loading available studies..." /> : null}
      <ErrorMessage message={error} />

      <section className="panel">
        <div className="panel-header">
          <div className="section-heading">
            <h3>Study Selection</h3>
            <p>{studies.length} studies available from Orthanc</p>
          </div>
        </div>
        <div className="toolbar comparison-controls">
          <div className="field inline-field">
            <label htmlFor="study-search">Search studies</label>
            <div className="input-icon">
              <SearchIcon size={16} />
              <input
                id="study-search"
                value={studySearch}
                onChange={(event) => setStudySearch(event.target.value)}
                placeholder="Date, description or patient ID"
              />
            </div>
          </div>
          <div className="field inline-field">
            <label htmlFor="left-study">
              <span className="series-tag">A</span> First study
            </label>
            <select id="left-study" value={selectedLeft} onChange={(event) => setSelectedLeft(event.target.value)}>
              <option value="">Select a study</option>
              {filteredStudies.map((study) => (
                <StudyOption key={study.id} study={study} />
              ))}
            </select>
          </div>
          <div className="field inline-field">
            <label htmlFor="right-study">
              <span className="series-tag">B</span> Second study
            </label>
            <select id="right-study" value={selectedRight} onChange={(event) => setSelectedRight(event.target.value)}>
              <option value="">Select a study</option>
              {filteredStudies.map((study) => (
                <StudyOption key={study.id} study={study} />
              ))}
            </select>
          </div>
          <button type="button" className="primary-button" onClick={handleCompare} disabled={loadingComparison}>
            <CompareIcon size={16} />
            <span>{loadingComparison ? 'Comparing...' : 'Compare Studies'}</span>
          </button>
        </div>
      </section>

      <div className="viewport-grid">
        <StudyViewport label="A" profile={leftProfile} />
        <StudyViewport label="B" profile={rightProfile} />
      </div>

      {comparison ? (
        <section className="panel">
          <div className="panel-header">
            <div className="section-heading">
              <h3>Metadata Comparison</h3>
              <p>No clinical conclusion is generated. Missing values are shown as unavailable.</p>
            </div>
            <span className="legend">
              <span className="diff-chip">Differs</span> Values differ between studies
            </span>
          </div>
          <div className="table-wrap flush">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>
                    <span className="series-tag">A</span> Study A
                  </th>
                  <th>
                    <span className="series-tag">B</span> Study B
                  </th>
                  <th className="diff-col" aria-label="Difference" />
                </tr>
              </thead>
              <tbody>
                {comparisonGroups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="group-row">
                      <th colSpan={4} scope="colgroup">
                        {group.title}
                      </th>
                    </tr>
                    {group.fields.map((field) => {
                      const left = field.getValue(leftProfile);
                      const right = field.getValue(rightProfile);
                      const differs = isDifferent(left, right);
                      return (
                        <tr key={field.label} className={differs ? 'row-diff' : undefined}>
                          <th scope="row">{field.label}</th>
                          <td>{formatValue(left)}</td>
                          <td>{formatValue(right)}</td>
                          <td className="diff-col">{differs ? <span className="diff-chip">Differs</span> : null}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No comparison loaded"
          message="Select two studies, then run the comparison to review side-by-side metadata."
        />
      )}
    </section>
  );
}

