import axios from 'axios';

export function createOrthancService({ url, username, password, timeoutMs = 2500 }) {
  const baseURL = String(url || '').replace(/\/$/, '');
  const client = axios.create({
    baseURL,
    timeout: timeoutMs,
    auth: username ? { username, password } : undefined,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  function isAvailableError(error) {
    return !error?.response;
  }

  function readTag(source, tagName) {
    return source?.RequestedTags?.[tagName] ?? source?.MainDicomTags?.[tagName] ?? source?.[tagName] ?? null;
  }

  function normalizeValue(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : null;
    }

    return value;
  }

  function formatActivity(change) {
    return {
      id: change.ID,
      type: change.ChangeType,
      resourceType: change.ResourceType,
      timestamp: change.Date,
      path: change.Path,
    };
  }

  async function request(method, path, data) {
    const response = await client.request({ method, url: path, data });
    return response.data;
  }

  async function getSystem() {
    return request('GET', '/system');
  }

  async function getStatistics() {
    return request('GET', '/statistics');
  }

  async function getChanges(limit = 10) {
    return request('GET', `/changes?limit=${limit}`);
  }

  async function findResources(level, options = {}) {
    return request('POST', '/tools/find', {
      Level: level,
      Expand: true,
      ...options,
    });
  }

  async function getStudy(studyId) {
    return request('GET', `/studies/${studyId}`);
  }

  async function getSeries(seriesId) {
    return request('GET', `/series/${seriesId}`);
  }

  async function getInstance(instanceId) {
    return request('GET', `/instances/${instanceId}`);
  }

  async function getInstanceTags(instanceId) {
    return request('GET', `/instances/${instanceId}/simplified-tags`);
  }

  async function getInstanceSearchRows(limit = 150) {
    const response = await findResources('Instance', {
      Query: {},
      Limit: limit,
      OrderBy: [
        {
          Type: 'DicomTag',
          Key: 'StudyDate',
          Direction: 'DESC',
        },
      ],
      RequestedTags: [
        'PatientID',
        'PatientName',
        'StudyID',
        'StudyDate',
        'StudyDescription',
        'StudyInstanceUID',
        'SeriesDescription',
        'SeriesInstanceUID',
        'SeriesNumber',
        'Modality',
        'InstanceNumber',
        'SliceThickness',
        'KVP',
        'XRayTubeCurrent',
        'TubeCurrent',
        'ReconstructionAlgorithm',
        'ExposureIndex',
        'TargetExposureIndex',
        'DeviationIndex',
      ],
    });

    return Array.isArray(response) ? response : [];
  }

  function buildStudyProfile(study, series, instance, instanceTags) {
    const studyTags = study?.MainDicomTags || {};
    const seriesTags = series?.MainDicomTags || {};
    const tags = instanceTags || {};

    return {
      id: study?.ID ?? null,
      patientId: normalizeValue(readTag(study, 'PatientID')),
      patientName: normalizeValue(readTag(study, 'PatientName')),
      studyId: normalizeValue(readTag(study, 'StudyID')),
      studyDate: normalizeValue(readTag(study, 'StudyDate')),
      studyDescription: normalizeValue(readTag(study, 'StudyDescription')),
      studyInstanceUID: normalizeValue(readTag(study, 'StudyInstanceUID')),
      modalitiesInStudy: normalizeValue(readTag(study, 'ModalitiesInStudy')),
      seriesCount: Array.isArray(study?.Series) ? study.Series.length : null,
      primarySeries: {
        id: series?.ID ?? null,
        seriesDate: normalizeValue(seriesTags.SeriesDate),
        seriesDescription: normalizeValue(seriesTags.SeriesDescription),
        seriesNumber: normalizeValue(seriesTags.SeriesNumber),
        modality: normalizeValue(seriesTags.Modality),
        protocolName: normalizeValue(seriesTags.ProtocolName),
      },
      primaryInstance: {
        id: instance?.ID ?? null,
        instanceNumber: normalizeValue(tags.InstanceNumber),
        sliceThickness: normalizeValue(tags.SliceThickness),
        kvp: normalizeValue(tags.KVP),
        tubeCurrent: normalizeValue(tags.XRayTubeCurrent ?? tags.TubeCurrent),
        reconstructionAlgorithm: normalizeValue(tags.ReconstructionAlgorithm),
        exposureIndex: normalizeValue(tags.ExposureIndex),
        targetExposureIndex: normalizeValue(tags.TargetExposureIndex),
        deviationIndex: normalizeValue(tags.DeviationIndex),
      },
      raw: {
        study: studyTags,
        series: seriesTags,
        instanceTags: tags,
      },
    };
  }

  async function getHealth() {
    try {
      const system = await getSystem();
      return {
        connected: true,
        status: 'Orthanc: Connected',
        name: system?.Name ?? system?.name ?? 'Orthanc',
        version: system?.Version ?? system?.version ?? null,
      };
    } catch {
      return {
        connected: false,
        status: 'Orthanc: Not Connected',
        name: null,
        version: null,
      };
    }
  }

  async function getDashboardSummary() {
    try {
      const health = await getHealth();
      if (!health.connected) {
        return {
          ...health,
          studies: null,
          series: null,
          instances: null,
          recentActivity: [],
          message: 'Unable to retrieve Orthanc data.',
        };
      }

      const [statistics, changes] = await Promise.all([getStatistics(), getChanges(6)]);
      return {
        ...health,
        studies: statistics.CountStudies ?? statistics.Studies ?? null,
        series: statistics.CountSeries ?? statistics.Series ?? null,
        instances: statistics.CountInstances ?? statistics.Instances ?? null,
        recentActivity: Array.isArray(changes?.Changes) ? changes.Changes.slice(0, 6).map(formatActivity) : [],
        message: null,
      };
    } catch {
      return {
        connected: false,
        status: 'Orthanc unavailable',
        name: null,
        version: null,
        studies: null,
        series: null,
        instances: null,
        recentActivity: [],
        message: 'Unable to retrieve Orthanc data.',
      };
    }
  }

  async function listStudies({ limit = 50 } = {}) {
    try {
      const rows = await findResources('Study', {
        Query: {},
        Limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
        OrderBy: [
          {
            Type: 'DicomTag',
            Key: 'StudyDate',
            Direction: 'DESC',
          },
        ],
        RequestedTags: ['PatientID', 'PatientName', 'StudyID', 'StudyDate', 'StudyDescription', 'StudyInstanceUID', 'ModalitiesInStudy'],
      });

      return rows.map((study) => ({
        id: study.ID,
        patientId: normalizeValue(readTag(study, 'PatientID')),
        patientName: normalizeValue(readTag(study, 'PatientName')),
        studyId: normalizeValue(readTag(study, 'StudyID')),
        studyDate: normalizeValue(readTag(study, 'StudyDate')),
        studyDescription: normalizeValue(readTag(study, 'StudyDescription')),
        studyInstanceUID: normalizeValue(readTag(study, 'StudyInstanceUID')),
        modalitiesInStudy: normalizeValue(readTag(study, 'ModalitiesInStudy')),
        seriesCount: Array.isArray(study.Series) ? study.Series.length : null,
      }));
    } catch {
      try {
        const ids = await request('GET', '/studies');
        const limitedIds = Array.isArray(ids) ? ids.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200)) : [];
        const studies = await Promise.all(limitedIds.map((studyId) => getStudy(studyId).catch(() => null)));

        return studies.filter(Boolean).map((study) => ({
          id: study.ID,
          patientId: normalizeValue(readTag(study, 'PatientID')),
          patientName: normalizeValue(readTag(study, 'PatientName')),
          studyId: normalizeValue(readTag(study, 'StudyID')),
          studyDate: normalizeValue(readTag(study, 'StudyDate')),
          studyDescription: normalizeValue(readTag(study, 'StudyDescription')),
          studyInstanceUID: normalizeValue(readTag(study, 'StudyInstanceUID')),
          modalitiesInStudy: normalizeValue(readTag(study, 'ModalitiesInStudy')),
          seriesCount: Array.isArray(study.Series) ? study.Series.length : null,
        }));
      } catch {
        return [];
      }
    }
  }

  async function getExposureIndexRows({ limit = 150 } = {}) {
    try {
      const rows = await getInstanceSearchRows(limit);

      return rows.map((instance) => ({
        id: instance.ID,
        studyId: normalizeValue(readTag(instance, 'StudyID')),
        studyDate: normalizeValue(readTag(instance, 'StudyDate')),
        studyDescription: normalizeValue(readTag(instance, 'StudyDescription')),
        studyInstanceUID: normalizeValue(readTag(instance, 'StudyInstanceUID')),
        patientId: normalizeValue(readTag(instance, 'PatientID')),
        patientName: normalizeValue(readTag(instance, 'PatientName')),
        modality: normalizeValue(readTag(instance, 'Modality')),
        seriesId: instance.ParentSeries ?? null,
        seriesDescription: normalizeValue(readTag(instance, 'SeriesDescription')),
        seriesNumber: normalizeValue(readTag(instance, 'SeriesNumber')),
        instanceNumber: normalizeValue(readTag(instance, 'InstanceNumber')),
        exposureIndex: normalizeValue(readTag(instance, 'ExposureIndex')),
        targetExposureIndex: normalizeValue(readTag(instance, 'TargetExposureIndex')),
        deviationIndex: normalizeValue(readTag(instance, 'DeviationIndex')),
      }));
    } catch {
      return [];
    }
  }

  async function getStudyProfile(studyId) {
    const study = await getStudy(studyId);
    const seriesIds = Array.isArray(study.Series) ? study.Series : [];
    const primarySeriesId = seriesIds[0] ?? null;

    let series = null;
    let instance = null;
    let instanceTags = null;

    if (primarySeriesId) {
      series = await getSeries(primarySeriesId);
      const instanceIds = Array.isArray(series?.Instances) ? series.Instances : [];
      const primaryInstanceId = instanceIds[0] ?? null;

      if (primaryInstanceId) {
        instance = await getInstance(primaryInstanceId);
        instanceTags = await getInstanceTags(primaryInstanceId);
      }
    }

    return buildStudyProfile(study, series, instance, instanceTags);
  }

  async function compareStudies(leftStudyId, rightStudyId) {
    const [left, right] = await Promise.all([getStudyProfile(leftStudyId), getStudyProfile(rightStudyId)]);
    return { left, right };
  }

  async function getOrthancStatus() {
    const health = await getHealth();
    return health.connected
      ? { connected: true, status: health.status, name: health.name, version: health.version }
      : { connected: false, status: 'Orthanc unavailable', name: null, version: null };
  }

  async function getRecentActivity(limit = 6) {
    try {
      const changes = await getChanges(limit);
      return Array.isArray(changes?.Changes) ? changes.Changes.slice(0, limit).map(formatActivity) : [];
    } catch {
      return [];
    }
  }

  async function getConnectionSummary() {
    const health = await getHealth();
    if (!health.connected) {
      return {
        studies: null,
        series: null,
        instances: null,
      };
    }

    const statistics = await getStatistics();
    return {
      studies: statistics.CountStudies ?? statistics.Studies ?? null,
      series: statistics.CountSeries ?? null,
      instances: statistics.CountInstances ?? null,
    };
  }

  return {
    getHealth,
    getDashboardSummary,
    getSystem,
    getStatistics,
    getChanges,
    listStudies,
    getExposureIndexRows,
    getStudyProfile,
    compareStudies,
    getOrthancStatus,
    getRecentActivity,
    getConnectionSummary,
  };
}
