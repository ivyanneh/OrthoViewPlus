import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';
import AiResultView from '../components/AiResultView.jsx';
import DicomViewer from '../components/DicomViewer.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDicomDate, formatValue, getApiError } from '../utils/format.js';

const CAPABILITY_HELP = {
  restore: 'Create a derived contrast/sharpness-restored image; the original acquisition is preserved.',
  completeness: 'Review a heuristic field-of-view coverage assessment. It does not determine diagnostic adequacy.',
  compare: 'Compare the current image with a prior authorized study for the same verified patient.',
  reconstruct: 'Estimate low-signal areas from a prior authorized same-patient study; generated areas require review.',
  segment3d: 'Build an experimental isosurface from a CT/MR series with sufficient slices.',
  synthetic: 'Generate a labelled procedural phantom without patient images or patient identity.',
  complementary: 'Generate an experimental estimated view; it is not an acquired projection.',
};
const CAPABILITY_TITLE = {
  restore: 'Image restoration',
  completeness: 'Completeness assessment',
  compare: 'Longitudinal comparison',
  reconstruct: 'Image reconstruction',
  segment3d: '3D visualization',
  synthetic: 'Synthetic image generation',
  complementary: 'Complementary-view synthesis',
};

export default function RadiologistDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [requestQueue, setRequestQueue] = useState([]);
  const [studies, setStudies] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [capabilities, setCapabilities] = useState([]);
  const [aiHealth, setAiHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [selectedStudyId, setSelectedStudyId] = useState('');
  const [selectedPriorStudyId, setSelectedPriorStudyId] = useState('');
  const [studyProfile, setStudyProfile] = useState(null);
  const [patientHistory, setPatientHistory] = useState(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [capability, setCapability] = useState('restore');
  const [syntheticSeed, setSyntheticSeed] = useState(7);
  const [seriesId, setSeriesId] = useState('');
  const [studyLimit, setStudyLimit] = useState(50);
  const [job, setJob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [report, setReport] = useState(null);

  const selectedRequest = useMemo(
    () => requests.find((request) => String(request.id) === String(selectedRequestId)),
    [requests, selectedRequestId],
  );
  const selectedStudy = useMemo(
    () => studies.find((study) => study.id === selectedStudyId),
    [studies, selectedStudyId],
  );
  const priorStudies = useMemo(
    () => studies.filter((study) =>
      study.id !== selectedStudyId &&
      Number(study.patientRecordId) === Number(selectedStudy?.patientRecordId),
    ),
    [studies, selectedStudy, selectedStudyId],
  );
  const selectedCapability = capabilities.find((item) => item.key === capability);
  const needsStudy = capability !== 'synthetic';
  const needsPrior = capability === 'compare' || capability === 'reconstruct';
  const needsSeries = capability === 'segment3d';

  async function loadWorkspace(limit = studyLimit) {
    setError('');
    const [assignedResult, queueResult, studyResult, capabilityResult, healthResult, jobsResult] = await Promise.allSettled([
      api.get('/clinical/requests', { params: { mine: 'true' } }),
      api.get('/clinical/requests'),
      api.get('/imaging/studies', { params: { limit } }),
      api.get('/ai/capabilities'),
      api.get('/ai/health'),
      api.get('/ai/jobs', { params: { limit: 100 } }),
    ]);

    if (assignedResult.status === 'fulfilled') {
      setRequests(assignedResult.value.data.requests || []);
    } else {
      setError(getApiError(assignedResult.reason, 'Unable to load assigned imaging requests.'));
    }

    if (queueResult.status === 'fulfilled') {
      setRequestQueue((queueResult.value.data.requests || []).filter((request) =>
        !request.assignedRadiologistId || Number(request.assignedRadiologistId) === Number(user?.id),
      ));
    }

    if (studyResult.status === 'fulfilled') {
      setStudies(studyResult.value.data.studies || []);
    } else {
      setError((current) => current || getApiError(studyResult.reason, 'Unable to discover assigned Orthanc studies.'));
    }

    if (capabilityResult.status === 'fulfilled') {
      setCapabilities(capabilityResult.value.data.capabilities || []);
    } else {
      setAiError(getApiError(capabilityResult.reason, 'Unable to load AI capability information.'));
    }

    if (healthResult.status === 'fulfilled') setAiHealth(healthResult.value.data);
    if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value.data.jobs || []);
    else setAiError((current) => current || getApiError(jobsResult.reason, 'Unable to load authorized AI job history.'));
    setLoading(false);
  }

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (!job?.id || !['queued', 'running'].includes(job.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await api.get(`/ai/jobs/${job.id}`);
        setJob(response.data.job);
        setJobs((current) => current.map((item) => item.id === response.data.job.id ? response.data.job : item));
        setAiError('');
      } catch (requestError) {
        setAiError(getApiError(requestError, 'Unable to refresh the AI job.'));
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function claimRequest(request) {
    setClaimingId(request.id);
    setError('');
    try {
      await api.post(`/clinical/requests/${request.id}/assign`);
      setSelectedRequestId(String(request.id));
      await loadWorkspace();
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to claim this imaging request.'));
    } finally {
      setClaimingId(null);
    }
  }

  async function openRequest(request) {
    setSelectedRequestId(String(request.id));
    const linkedStudy = studies.find((study) => Number(study.imagingRequestId) === Number(request.id));
    if (linkedStudy) await openStudy(linkedStudy);
    else {
      setSelectedStudyId('');
      setStudyProfile(null);
      setJob(null);
      setReport(null);
      setFindings('');
      setImpression('');
      try {
        const history = await api.get(`/clinical/patients/${request.patientId}`, {
          params: { requestId: request.id },
        });
        setPatientHistory(history.data);
      } catch (requestError) {
        setError(getApiError(requestError, 'Unable to load the assigned patient history.'));
      }
    }
  }

  async function openStudy(study) {
    setSelectedStudyId(study.id);
    setSelectedPriorStudyId('');
    setStudyProfile(null);
    setPatientHistory(null);
    setJob(null);
    setReport(null);
    setFindings('');
    setImpression('');
    setReportStatus('');
    setLoadingStudy(true);
    setError('');
    try {
      const response = await api.get(`/imaging/studies/${encodeURIComponent(study.id)}`);
      setStudyProfile(response.data);
      setSeriesId(response.data.series?.[0]?.id || '');
      const patientRecordId = response.data.linkedPatient?.id || study.patientRecordId;
      if (patientRecordId) {
        const requestId = response.data.imagingRequestId || study.imagingRequestId;
        const [history, reportList] = await Promise.all([
          api.get(`/clinical/patients/${patientRecordId}`, {
            params: requestId ? { requestId } : undefined,
          }),
          api.get('/clinical/reports', {
            params: { patientId: patientRecordId, mine: 'true' },
          }),
        ]);
        setPatientHistory(history.data);
        const existingReport = (reportList.data.reports || []).find(
          (item) => Number(item.imagingStudyId) === Number(response.data.sourceStudyId),
        ) || null;
        setReport(existingReport);
        setFindings(existingReport?.findings || '');
        setImpression(existingReport?.impression || '');
      }
    } catch (requestError) {
      setError(getApiError(requestError, 'Unable to open the assigned imaging study.'));
    } finally {
      setLoadingStudy(false);
    }
  }

  async function submitAi() {
    setAiError('');
    if (!aiHealth?.available) {
      setAiError('The AI processing service is unavailable. Start the configured FastAPI service and retry.');
      return;
    }
    if (needsStudy && (!studyProfile?.study?.primaryInstance?.id || !studyProfile.sourceStudyId)) {
      setAiError('Open an assigned and linked study before processing.');
      return;
    }
    if (needsPrior && !selectedPriorStudyId) {
      setAiError('Select a different prior study assigned to you for this capability.');
      return;
    }
    if (needsSeries && !seriesId) {
      setAiError('Select a series for 3D visualization.');
      return;
    }

    setSubmitting(true);
    try {
      let priorInstanceId = null;
      if (needsPrior) {
        const prior = priorStudies.find((item) => item.id === selectedPriorStudyId);
        if (!prior) throw new Error('The selected prior study is not available in your assigned study list.');
        const priorProfile = await api.get(`/imaging/studies/${encodeURIComponent(prior.id)}`);
        priorInstanceId = priorProfile.data.study?.primaryInstance?.id;
        if (!priorInstanceId) throw new Error('The selected prior study has no accessible image instance.');
      }
      const response = await api.post('/ai/jobs', {
        capability,
        ...(capability === 'synthetic' ? { notes: String(syntheticSeed) } : {}),
        ...(needsStudy ? {
          sourceStudyId: studyProfile.sourceStudyId,
          instanceId: needsSeries ? undefined : studyProfile.study.primaryInstance.id,
          seriesId: needsSeries ? seriesId : undefined,
          priorInstanceId,
          examType: selectedRequest?.examination || '',
          bodyPart: selectedRequest?.examination || '',
        } : {}),
      }, { timeout: 120000 });
      setJob(response.data.job);
      setJobs((current) => [response.data.job, ...current.filter((item) => item.id !== response.data.job.id)]);
    } catch (requestError) {
      setAiError(getApiError(requestError, requestError.message || 'Unable to queue the AI job.'));
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
      setAiError('');
    } catch (requestError) {
      setAiError(getApiError(requestError, 'Unable to refresh the AI job.'));
    }
  }

  async function reviewResult(resultId) {
    try {
      await api.post(`/ai/results/${resultId}/review`);
      await refreshJob();
    } catch (requestError) {
      setAiError(getApiError(requestError, 'Unable to mark the result as reviewed.'));
    }
  }

  async function saveReport() {
    if (!selectedStudy || !patientHistory?.patient?.id) {
      setReportStatus('Open an assigned study before saving a report.');
      return;
    }
    setReportStatus('');
    try {
      const response = await api.post('/clinical/reports', {
        ...(report?.id ? { id: report.id } : {}),
        patientId: patientHistory.patient.id,
        imagingStudyId: selectedStudy.sourceStudyId,
        imagingRequestId: selectedStudy.imagingRequestId,
        findings,
        impression,
      });
      setReport(response.data.report);
      setReportStatus(`Draft saved (report ${response.data.report.id}).`);
    } catch (requestError) {
      setReportStatus(getApiError(requestError, 'Unable to save the report draft.'));
    }
  }

  async function approveReport() {
    if (!report?.id) return;
    setReportStatus('');
    try {
      const response = await api.post(`/clinical/reports/${report.id}/approve`);
      setReport(response.data.report);
      setReportStatus('Report approved and finalized.');
    } catch (requestError) {
      setReportStatus(getApiError(requestError, 'Unable to approve the report.'));
    }
  }

  async function retryJob() {
    if (!job?.id) return;
    setAiError('');
    setSubmitting(true);
    try {
      const response = await api.post(`/ai/jobs/${job.id}/retry`, undefined, { timeout: 120000 });
      setJob(response.data.job);
      setJobs((current) => current.map((item) => item.id === response.data.job.id ? response.data.job : item));
    } catch (requestError) {
      setAiError(getApiError(requestError, 'Unable to retry the AI job.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState message="Loading radiologist workspace..." />;

  return (
    <section className="page radiologist-workspace">
      <div className="page-header">
        <div>
          <p className="kicker">Radiologist workstation</p>
          <h2>Assigned imaging and AI assistance</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => loadWorkspace()}>Refresh workspace</button>
      </div>
      {error ? <ErrorMessage message={error} /> : null}

      <div className="panel">
        <div className="panel-header"><h3>Imaging archive · assigned studies</h3></div>
        <div className="archive-toolbar">
          <label htmlFor="study-limit">Studies to load</label>
          <select id="study-limit" value={studyLimit} onChange={(event) => {
            const limit = Number(event.target.value);
            setStudyLimit(limit);
            loadWorkspace(limit);
          }}>
            {[25, 50, 100, 200].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
          </select>
        </div>
        {studies.length === 0 ? (
          <EmptyState
            title="No linked studies are assigned to your account"
            message="Studies are deliberately not exposed by patient match alone. An administrator must verify the DICOM PatientID mapping and link the exact Orthanc study to an imaging request assigned to you."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Patient identifier</th><th>Modality</th><th>Date</th><th>Description</th><th>Study status</th><th>Action</th></tr></thead>
              <tbody>
                {studies.map((study) => (
                  <tr key={study.id}>
                    <td>{formatValue(study.patientMrn)}</td>
                    <td>{formatValue(study.modalitiesInStudy)}</td>
                    <td>{formatDicomDate(study.studyDate)}</td>
                    <td>{formatValue(study.studyDescription)}</td>
                    <td>{formatValue(study.studyStatus)}</td>
                    <td><button type="button" className="secondary-button" onClick={() => openStudy(study)}>Open study</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h3>Assigned imaging requests</h3></div>
        {requests.length === 0 ? (
          <EmptyState title="No assigned requests" message="Claim an available examination from the request queue below." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Patient</th><th>Examination</th><th>Status</th><th>Linked study</th><th>Action</th></tr></thead>
              <tbody>
                {requests.map((request) => {
                  const linked = studies.find((study) => Number(study.imagingRequestId) === Number(request.id));
                  return (
                    <tr key={request.id}>
                      <td>{request.lastName}, {request.firstName} · {request.mrn}</td>
                      <td>{request.examination} · {request.modality}</td>
                      <td>{request.status}</td>
                      <td>{linked?.studyDescription || 'Not linked'}</td>
                      <td><button type="button" className="secondary-button" onClick={() => openRequest(request)}>Open request</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header"><h3>Available request queue</h3></div>
        {requestQueue.filter((request) => !request.assignedRadiologistId).length === 0 ? (
          <p className="muted">No unassigned requests are currently available.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Patient</th><th>Examination</th><th>Priority</th><th>Action</th></tr></thead>
              <tbody>
                {requestQueue.filter((request) => !request.assignedRadiologistId).map((request) => (
                  <tr key={request.id}>
                    <td>{request.lastName}, {request.firstName} · {request.mrn}</td>
                    <td>{request.examination} · {request.modality}</td>
                    <td>{request.priority}</td>
                    <td><button type="button" className="primary-button" disabled={claimingId === request.id} onClick={() => claimRequest(request)}>
                      {claimingId === request.id ? 'Claiming...' : 'Claim request'}
                    </button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loadingStudy ? <LoadingState message="Loading authorized study and patient history..." /> : null}
      {studyProfile ? (
        <>
          <DicomViewer study={selectedStudy} profile={studyProfile} seriesId={seriesId} onSeriesChange={setSeriesId} />
          {patientHistory ? (
            <div className="panel">
              <div className="panel-header"><h3>Patient imaging history</h3></div>
              <p>{patientHistory.patient.firstName} {patientHistory.patient.lastName} · MRN {patientHistory.patient.mrn}</p>
              <p>Reports: {patientHistory.history?.reports?.length || 0} · Linked studies: {patientHistory.history?.studies?.length || 0}</p>
              <label htmlFor="prior-study">Authorized prior study for comparison/reconstruction</label>
              <select id="prior-study" value={selectedPriorStudyId} onChange={(event) => setSelectedPriorStudyId(event.target.value)}>
                <option value="">Select a different assigned study</option>
                {priorStudies.map((study) => (
                  <option key={study.id} value={study.id}>{formatDicomDate(study.studyDate)} · {study.modalitiesInStudy} · {study.studyDescription}</option>
                ))}
              </select>
              {priorStudies.length === 0 ? <p className="muted">No other study for this patient is both linked and assigned to you.</p> : null}
            </div>
          ) : null}
        </>
      ) : selectedStudyId && !loadingStudy ? <ErrorMessage message={error || 'No study details are loaded.'} /> : null}

      <div className="panel ai-workspace">
        <div className="panel-header">
          <div><h3>AI-assisted imaging</h3><p>Derived outputs require radiologist review and do not provide diagnosis.</p></div>
          <span className={aiHealth?.available ? 'service-status available' : 'service-status unavailable'}>
            {aiHealth?.available ? 'AI service available' : 'AI service unavailable'}
          </span>
        </div>
        {!aiHealth?.available ? <p className="muted">Start the configured FastAPI service to submit jobs. The capability controls remain visible, but processing is disabled until the service responds.</p> : null}
        {aiError ? <ErrorMessage message={aiError} /> : null}
        <div className="field">
          <span className="field-label">Approved capabilities</span>
          <div className="ai-capability-grid" role="group" aria-label="Select an AI capability">
            {capabilities.map((item) => (
              <button
                type="button"
                key={item.key}
                className={capability === item.key ? 'ai-capability-card selected' : 'ai-capability-card'}
                aria-pressed={capability === item.key}
                onClick={() => {
                  setCapability(item.key);
                  setJob(null);
                  setAiError('');
                }}
              >
                <strong>{CAPABILITY_TITLE[item.key] || item.key}</strong>
                <span>{CAPABILITY_HELP[item.key] || item.label}</span>
              </button>
            ))}
          </div>
          <p className="muted">{CAPABILITY_HELP[capability] || selectedCapability?.label}</p>
        </div>
        {needsStudy && !studyProfile ? <p className="muted">Select an assigned study above before submitting this capability.</p> : null}
        {needsPrior ? (
          <p className="muted">{selectedPriorStudyId ? 'The selected prior study is linked, same-patient, and assigned to you.' : 'A different prior assigned study is required.'}</p>
        ) : null}
        {needsSeries ? <p className="muted">Selected series: {formatValue(studyProfile?.series?.find((item) => item.id === seriesId)?.description)}. Select the series in the viewer before running.</p> : null}
        {capability === 'synthetic' ? (
          <div className="field">
            <label htmlFor="synthetic-seed">Synthetic phantom seed</label>
            <input id="synthetic-seed" type="number" min="0" max="2147483647" value={syntheticSeed} onChange={(event) => setSyntheticSeed(event.target.value)} />
            <p className="muted">This creates a procedural phantom and does not use patient images or identity.</p>
          </div>
        ) : null}
        <button type="button" className="primary-button" onClick={submitAi} disabled={submitting || !aiHealth?.available || (needsStudy && !studyProfile)}>
          {submitting ? 'Submitting...' : 'Submit for processing'}
        </button>
        <div className="field">
          <label htmlFor="ai-job-history">Authorized AI job history</label>
          <select
            id="ai-job-history"
            value={job?.id || ''}
            onChange={async (event) => {
              const selectedJob = jobs.find((item) => String(item.id) === event.target.value);
              if (!selectedJob) {
                setJob(null);
                return;
              }
              try {
                const response = await api.get(`/ai/jobs/${selectedJob.id}`);
                setJob(response.data.job);
                setJobs((current) => current.map((item) => item.id === response.data.job.id ? response.data.job : item));
                setAiError('');
              } catch (requestError) {
                setAiError(getApiError(requestError, 'Unable to load the selected AI job results.'));
              }
            }}
          >
            <option value="">Select a previous job</option>
            {jobs.map((item) => (
              <option key={item.id} value={item.id}>Job {item.id} · {item.capability} · {item.status}</option>
            ))}
          </select>
        </div>
        {job ? (
          <div className="ai-job-status" aria-live="polite">
            <div className="panel-header">
              <h4>Job {job.id} · {job.capability} · {job.status}</h4>
              <button type="button" className="secondary-button" onClick={refreshJob}>Refresh status</button>
            </div>
            {job.error ? <ErrorMessage message={job.error} /> : null}
            {job.status === 'failed' ? (
              <button type="button" className="secondary-button" onClick={retryJob} disabled={submitting}>
                {submitting ? 'Retrying...' : 'Retry processing'}
              </button>
            ) : null}
            {job.results?.map((result) => (
              <div key={result.id}>
                <AiResultView result={result} />
                {result.reviewStatus !== 'reviewed' ? (
                  <button type="button" className="secondary-button" onClick={() => reviewResult(result.id)}>Mark reviewed</button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {selectedStudy ? (
        <div className="panel">
          <div className="panel-header">
            <h3>Radiology report</h3>
            {report ? <span>{report.status === 'approved' ? 'Approved' : 'Draft'} · Report {report.id}</span> : <span>New draft</span>}
          </div>
          <div className="field">
            <label htmlFor="report-findings">Findings</label>
            <textarea id="report-findings" value={findings} onChange={(event) => setFindings(event.target.value)} rows={6} disabled={report?.status === 'approved'} />
          </div>
          <div className="field">
            <label htmlFor="report-impression">Impression</label>
            <textarea id="report-impression" value={impression} onChange={(event) => setImpression(event.target.value)} rows={4} disabled={report?.status === 'approved'} />
          </div>
          {report?.status !== 'approved' ? (
            <>
              <button type="button" className="secondary-button" onClick={saveReport}>Save draft</button>
              <button type="button" className="primary-button" onClick={approveReport} disabled={!report?.id || (!findings.trim() && !impression.trim())}>Approve and finalize</button>
              {!report?.id ? <p className="muted">Save the draft before approving it.</p> : null}
            </>
          ) : <p className="muted">This approved report is finalized and cannot be edited.</p>}
          {reportStatus ? <p role="status">{reportStatus}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
