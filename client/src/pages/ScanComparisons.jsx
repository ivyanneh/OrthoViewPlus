import { useEffect, useState } from 'react';
import api from '../api/client.js';
import DicomViewer from '../components/DicomViewer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { getApiError } from '../utils/format.js';

export default function ScanComparisons() {
  const [assignedRequests, setAssignedRequests] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [studies, setStudies] = useState([]);
  const [selectedStudies, setSelectedStudies] = useState(new Set());
  const [comparisonResults, setComparisonResults] = useState(null);
  const [seriesIds, setSeriesIds] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadAssignedRequests() {
    setError('');
    setLoading(true);
    try {
      const response = await api.get('/clinical/requests', { params: { mine: true } });
      setAssignedRequests(response.data.requests || []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load your assigned imaging requests.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignedRequests();
  }, []);

  async function selectPatient(request) {
    setSelectedPatient(request);
    setSelectedStudies(new Set());
    setComparisonResults(null);
    setError('');

    try {
      const historyResponse = await api.get(`/clinical/patients/${request.patientId || request.patient_id}`, {
        params: { requestId: request.id },
      });
      setStudies(historyResponse.data.history?.studies || []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load patient studies.'));
    }
  }

  function toggleStudySelection(studyId) {
    const newSelection = new Set(selectedStudies);
    if (newSelection.has(studyId)) {
      newSelection.delete(studyId);
    } else {
      newSelection.add(studyId);
    }
    setSelectedStudies(newSelection);
  }

  async function compareSelectedScans() {
    if (selectedStudies.size < 2) {
      setError('Select at least 2 studies to compare.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const selectedStudyList = studies.filter((study) =>
        selectedStudies.has(study.id)
      );

      const studyProfiles = await Promise.all(
        selectedStudyList.map((study) => {
          const targetOrthancId = study.orthancStudyId || study.orthanc_study_id || study.id;
          return api.get(`/imaging/studies/${encodeURIComponent(targetOrthancId)}`).catch(() => ({
            data: {
              study: study,
              series: [{ id: `series-${study.id}`, Description: study.description || 'Series 1' }]
            }
          }));
        })
      );

      const profiles = studyProfiles.map((response) => response.data);

      setSeriesIds(
        Object.fromEntries(
          selectedStudyList.map((study, index) => [
            study.id,
            profiles[index]?.series?.[0]?.id || `series-${study.id}`,
          ])
        )
      );

      setComparisonResults({
        studies: selectedStudyList,
        profiles,
      });
    } catch (err) {
      setError(getApiError(err, 'Unable to load study details for comparison.'));
    } finally {
      setLoading(false);
    }
  }

  function handleNewSearch() {
    setSelectedPatient(null);
    setStudies([]);
    setSelectedStudies(new Set());
    setComparisonResults(null);
  }

  return (
    <section className="page">
      {!comparisonResults ? (
        <>
          <div className="panel">
            <div className="panel-header">
              <h3>Select Patient for Comparison</h3>
            </div>
            {error ? <ErrorMessage message={error} /> : null}
            {loading ? <LoadingState message="Loading patients..." /> : null}
            
            {!selectedPatient ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Patient ID</th>
                      <th>Name</th>
                      <th>Examination</th>
                      <th>Modality</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignedRequests.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem' }}>
                          No assigned requests found.
                        </td>
                      </tr>
                    ) : (
                      assignedRequests.map((request) => (
                        <tr key={request.id}>
                          <td>{request.mrn || request.patient_mrn || request.patientId || 'N/A'}</td>
                          <td>{request.firstName || request.patient_first_name} {request.lastName || request.patient_last_name}</td>
                          <td>{request.examination || 'N/A'}</td>
                          <td>{request.modality || 'N/A'}</td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => selectPatient(request)}
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div className="panel-body">
                  <button type="button" className="secondary-button" onClick={handleNewSearch}>
                    Select Different Patient
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Study Date</th>
                        <th>Modality</th>
                        <th>Description</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studies.map((study) => (
                        <tr key={study.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedStudies.has(study.id)}
                              onChange={() => toggleStudySelection(study.id)}
                            />
                          </td>
                          <td>{study.study_date || study.studyDate || 'N/A'}</td>
                          <td>{study.modality || 'N/A'}</td>
                          <td>{study.description || study.studyDescription || 'N/A'}</td>
                          <td>{study.source || 'original'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel-body">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={compareSelectedScans}
                    disabled={selectedStudies.size < 2 || loading}
                  >
                    Compare Selected Scans ({selectedStudies.size})
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="panel">
            <div className="panel-header">
              <h3>Scan Comparison Results</h3>
              <button type="button" className="secondary-button" onClick={handleNewSearch}>
                New Comparison
              </button>
            </div>
            {error ? <ErrorMessage message={error} /> : null}
            <div className="comparison-image-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', padding: '1rem' }}>
              {comparisonResults.studies.map((study, index) => {
                const profile = comparisonResults.profiles[index] || {};

                return (
                  <section key={study.id} className="panel" style={{ margin: 0 }}>
                    <div className="panel-header">
                      <h3>Study {index + 1}: {study.modality || 'DICOM'} ({study.study_date || 'N/A'})</h3>
                    </div>

                    <DicomViewer
                      study={profile.study || study}
                      profile={profile}
                      seriesId={seriesIds[study.id] || profile.series?.[0]?.id || ''}
                      onSeriesChange={(seriesId) =>
                        setSeriesIds((current) => ({
                          ...current,
                          [study.id]: seriesId,
                        }))
                      }
                    />

                    <div className="detail-grid" style={{ padding: '1rem' }}>
                      <div>
                        <dt>Date</dt>
                        <dd>{study.study_date || study.studyDate || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt>Modality</dt>
                        <dd>{study.modality || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt>Description</dt>
                        <dd>{study.description || study.studyDescription || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{study.source || 'original'}</dd>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Comparison Details</h3>
            </div>
            <div className="table-wrap">
              <table className="data-table comparison-table">
                <thead>
                  <tr>
                    <th scope="row">Attribute</th>
                    {comparisonResults.studies.map((study, index) => (
                      <th key={study.id}>Study {index + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Study Date</th>
                    {comparisonResults.studies.map((study) => (
                      <td key={study.id}>{study.study_date || study.studyDate || 'N/A'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Modality</th>
                    {comparisonResults.studies.map((study) => (
                      <td key={study.id}>{study.modality || 'N/A'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Description</th>
                    {comparisonResults.studies.map((study) => (
                      <td key={study.id}>{study.description || study.studyDescription || 'N/A'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Number of Series</th>
                    {comparisonResults.profiles.map((profile, index) => (
                      <td key={index}>{profile.series?.length || 1}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}