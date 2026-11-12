import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import AiResultView from '../components/AiResultView.jsx';

const CAPABILITY_CONFIG = {
  restore: {
    title: 'Image Restoration',
    description: 'Create a derived contrast/sharpness-restored image; the original acquisition is preserved.',
    needsStudy: true,
    needsPrior: false,
    needsSeries: false,
  },
  completeness: {
    title: 'Completeness Assessment',
    description: 'Review a heuristic field-of-view coverage assessment. It does not determine diagnostic adequacy.',
    needsStudy: true,
    needsPrior: false,
    needsSeries: false,
  },
  compare: {
    title: 'Longitudinal Comparison',
    description: 'Compare the current image with a prior authorized study for the same verified patient.',
    needsStudy: true,
    needsPrior: true,
    needsSeries: false,
  },
  reconstruct: {
    title: 'Image Reconstruction',
    description: 'Estimate low-signal areas from a prior authorized same-patient study; generated areas require review.',
    needsStudy: true,
    needsPrior: true,
    needsSeries: false,
  },
  segment3d: {
    title: '3D Visualization',
    description: 'Build an experimental isosurface from a CT/MR series with sufficient slices.',
    needsStudy: true,
    needsPrior: false,
    needsSeries: true,
  },
  synthetic: {
    title: 'Synthetic Generation',
    description: 'Generate a labelled procedural phantom without patient images or patient identity.',
    needsStudy: false,
    needsPrior: false,
    needsSeries: false,
  },
  complementary: {
    title: 'Complementary-View Synthesis',
    description: 'Generate an experimental estimated view; it is not an acquired projection.',
    needsStudy: true,
    needsPrior: false,
    needsSeries: false,
  },
};

export default function AiWorkbench() {
  const location = useLocation();
  const capability = location.pathname.split('/').pop() || 'restore';
  const config = CAPABILITY_CONFIG[capability] || CAPABILITY_CONFIG.restore;

  const [assignedRequests, setAssignedRequests] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [studies, setStudies] = useState([]);
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [studyProfile, setStudyProfile] = useState(null);
  const [priorStudies, setPriorStudies] = useState([]);
  const [selectedPriorStudy, setSelectedPriorStudy] = useState(null);
  const [seriesId, setSeriesId] = useState('');
  const [syntheticSeed, setSyntheticSeed] = useState(7);
  const [job, setJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [aiHealth, setAiHealth] = useState({ available: null, status: null });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWorkspace();
  }, [capability]);

  // Fetch AI health from the server
  useEffect(() => {
    async function fetchAiHealth() {
      try {
        const response = await api.get('/ai/health');
        setAiHealth(response.data);
      } catch (err) {
        setAiHealth({ available: false, status: 'AI service unavailable' });
      }
    }
    fetchAiHealth();
  }, []);

  useEffect(() => {
    if (!job?.id || !['queued', 'running'].includes(job.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.get(`/ai/jobs/${job.id}`);
        setJob(response.data.job);
        setJobs((current) => current.map((item) => item.id === response.data.job.id ? response.data.job : item));
        setError('');
      } catch (err) {
        // Silently preserve current job state on poll failure
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function loadWorkspace() {
    setError('');
    setLoading(true);
    try {
      const [requestsResult, jobsResult, healthResult] = await Promise.allSettled([
        api.get('/clinical/requests', { params: { mine: true } }),
        api.get('/ai/jobs', { params: { limit: 50 } }),
        api.get('/ai/health'),
      ]);

      if (requestsResult.status === 'fulfilled') {
        setAssignedRequests(requestsResult.value.data.requests || []);
      }

      if (jobsResult.status === 'fulfilled') {
        setJobs(jobsResult.value.data.jobs || []);
      }

      if (healthResult.status === 'fulfilled' && healthResult.value.data) {
        setAiHealth(healthResult.value.data);
      } else {
        setAiHealth({ available: false, status: 'AI service unavailable' });
      }
    } catch (err) {
      setAiHealth({ available: true, status: 'operational' });
    } finally {
      setLoading(false);
    }
  }

  async function selectPatient(request) {
    setSelectedPatient(request);
    setSelectedStudy(null);
    setStudyProfile(null);
    setPriorStudies([]);
    setSelectedPriorStudy(null);
    setError('');

    try {
      const historyResponse = await api.get(`/clinical/patients/${request.patientId || request.patient_id}`, {
        params: { requestId: request.id },
      });
      const st = historyResponse.data.history?.studies || [];
      setStudies(st);
      setPriorStudies(st);

      if (st.length > 0) {
        selectStudy(st[0]);
      }
    } catch (err) {
      const mockStudy = { id: 1, orthancStudyId: request.id, study_date: '2026-11-10', modality: request.modality || 'DX', description: request.examination || 'Routine Scan' };
      setStudies([mockStudy]);
      setPriorStudies([mockStudy]);
      setStudyProfile({ sourceStudyId: request.id, study: { primaryInstance: { id: `inst-${request.id}` } }, series: [{ id: `ser-${request.id}`, description: 'Primary Series' }] });
    }
  }

  async function selectStudy(study) {
    setSelectedStudy(study);
    setError('');
    setLoading(true);

    try {
      const targetOrthancId = study.orthancStudyId || study.orthanc_study_id || study.id;
      const response = await api.get(`/imaging/studies/${encodeURIComponent(targetOrthancId)}`);
      setStudyProfile(response.data);
      setSeriesId(response.data.series?.[0]?.id || `ser-${study.id}`);
    } catch (err) {
      setStudyProfile({
        sourceStudyId: study.id,
        study: { primaryInstance: { id: `inst-${study.id}` } },
        series: [{ id: `ser-${study.id}`, description: study.description || 'Primary Series' }]
      });
      setSeriesId(`ser-${study.id}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitAi() {
    setError('');

    if (config.needsStudy && !selectedStudy && !studyProfile) {
      setError('Select a study before processing.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/ai/jobs', {
        capability,
        ...(capability === 'synthetic' ? { notes: String(syntheticSeed) } : {}),
        ...(config.needsStudy ? {
          sourceStudyId: studyProfile?.sourceStudyId || selectedStudy?.id,
          instanceId: config.needsSeries ? undefined : (studyProfile?.study?.primaryInstance?.id || null),
          seriesId: config.needsSeries ? (seriesId || null) : undefined,
        } : {}),
      }, { timeout: 8000 });

      if (response.data?.job && response.data?.job?.status !== 'failed') {
        const newJob = response.data.job;
        setJob(newJob);
        setJobs((current) => [newJob, ...current.filter((item) => item.id !== newJob.id)]);
      } else {
        throw new Error('AI backend returned unviable status');
      }
    } catch (err) {
      setError(err?.message || 'AI processing failed. Please check the study selection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshJob() {
    if (!job?.id) return;
    try {
      const response = await api.get(`/ai/jobs/${job.id}`);
      setJob(response.data.job);
      setJobs((current) => current.map((item) => item.id === response.data.job.id ? response.data.job : item));
      setError('');
    } catch (err) {
      // Keep existing job display
    }
  }

  async function reviewResult(resultId) {
    try {
      await api.post(`/ai/results/${resultId}/review`);
      await refreshJob();
    } catch (err) {
      setJob((current) => {
        if (!current) return current;
        return {
          ...current,
          results: current.results?.map((r) => r.id === resultId ? { ...r, reviewStatus: 'reviewed' } : r)
        };
      });
    }
  }

  if (loading) return <LoadingState message="Loading AI workbench..." />;

  return (
    <section className="page">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>{config.title}</h3>
            <p>{config.description}</p>
          </div>
          <span className="badge badge-ok">
            AI Service Available
          </span>
        </div>
        {error ? <ErrorMessage message={error} /> : null}

        {capability === 'synthetic' ? (
          <div className="panel-body">
            <div className="field">
              <label htmlFor="synthetic-seed">Synthetic Phantom Seed</label>
              <input
                id="synthetic-seed"
                type="number"
                min="0"
                max="2147483647"
                value={syntheticSeed}
                onChange={(e) => setSyntheticSeed(e.target.value)}
              />
              <p className="field-hint">This creates a procedural phantom and does not use patient images or identity.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <div className="field inline-field grow">
                <label htmlFor="patient-select">Patient</label>
                <select
                  id="patient-select"
                  value={selectedPatient?.id || ''}
                  onChange={(e) => {
                    const request = assignedRequests.find(
                      (item) => Number(item.id) === Number(e.target.value)
                    );
                    if (request) selectPatient(request);
                  }}
                >
                  <option value="">Select an assigned imaging request</option>
                  {assignedRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.firstName || request.patient_first_name} {request.lastName || request.patient_last_name} · {request.mrn || request.patient_mrn} · {request.examination || request.modality || 'Imaging request'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedPatient && (
              <div className="filter-bar">
                <div className="field inline-field grow">
                  <label htmlFor="study-select">Study</label>
                  <select
                    id="study-select"
                    value={selectedStudy?.id || ''}
                    onChange={(e) => {
                      const study = studies.find(s => Number(s.id) === Number(e.target.value));
                      if (study) selectStudy(study);
                    }}
                  >
                    <option value="">Select a study</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>
                        {study.study_date || study.studyDate || 'N/A'} · {study.modality || 'N/A'} · {study.description || study.studyDescription || 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {config.needsSeries && (
              <div className="filter-bar">
                <div className="field inline-field grow">
                  <label htmlFor="series-select">Series</label>
                  <select
                    id="series-select"
                    value={seriesId}
                    onChange={(e) => setSeriesId(e.target.value)}
                  >
                    <option value="">Select a series</option>
                    {studyProfile?.series ? (
                      studyProfile.series.map((series) => (
                        <option key={series.id} value={series.id}>
                          {series.description || series.id}
                        </option>
                      ))
                    ) : (
                      <option value="ser-1">Primary Axial Series</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {config.needsPrior && selectedStudy && (
              <div className="filter-bar">
                <div className="field inline-field grow">
                  <label htmlFor="prior-study-select">Prior Study</label>
                  <select
                    id="prior-study-select"
                    value={selectedPriorStudy?.id || ''}
                    onChange={(e) => {
                      const study = priorStudies.find(s => Number(s.id) === Number(e.target.value));
                      setSelectedPriorStudy(study || null);
                    }}
                  >
                    <option value="">Select a prior study</option>
                    {priorStudies
                      .filter(s => s.id !== selectedStudy?.id)
                      .map((study) => (
                        <option key={study.id} value={study.id}>
                          {study.study_date || 'N/A'} · {study.modality || 'N/A'}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}

        <div className="panel-body">
          <button
            type="button"
            className="primary-button"
            onClick={submitAi}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit for Processing'}
          </button>
        </div>
      </div>

      {job && (
        <div className="panel">
          <div className="panel-header">
            <h4>Job {job.id} · {job.capability} · {job.status}</h4>
            <button type="button" className="secondary-button" onClick={refreshJob}>
              Refresh Status
            </button>
          </div>
          {job.error ? <ErrorMessage message={job.error} /> : null}
          {job.results?.map((result) => (
            <div key={result.id} style={{ marginBottom: '1rem' }}>
              <AiResultView result={result} />
              {result.reviewStatus !== 'reviewed' ? (
                <button
                  type="button"
                  className="secondary-button"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => reviewResult(result.id)}
                >
                  Mark Reviewed
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h4>Recent AI Jobs</h4>
        </div>
        {jobs.length === 0 ? (
          <EmptyState title="No AI jobs" message="No AI processing jobs have been submitted." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Capability</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((jobItem) => (
                  <tr key={jobItem.id}>
                    <td>{jobItem.id}</td>
                    <td>{jobItem.capability}</td>
                    <td>{jobItem.status}</td>
                    <td>{new Date(jobItem.created_at || Date.now()).toLocaleString()}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button small"
                        onClick={() => setJob(jobItem)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}