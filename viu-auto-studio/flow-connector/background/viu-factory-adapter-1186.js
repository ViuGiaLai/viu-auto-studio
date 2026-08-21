// Viu controller for the untouched Flow Factory 1.1.8 runtime.
// Viu supplies SCRIPT INPUT/settings; the original sidepanel engine performs
// SCRIPT -> IMAGE PROMPTS -> IMAGES -> VIDEO PROMPTS -> VIDEOS.
const VIU_ACTIVE_FACTORY_KEY = 'viuActiveFactory118';
const VIU_WORKER_KEY = 'viuWorker118';
let viuPolling = false;
let viuCurrentAttempt = null;
const viuUploading = new Set();

const viuSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function viuSaved() {
  return chrome.storage.local.get([
    'apiBaseUrl', 'bootstrapToken', 'factorySessionId', 'paired', 'autoFactory',
    VIU_ACTIVE_FACTORY_KEY, VIU_WORKER_KEY,
  ]);
}

function viuLocalBase(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Viu API must be local');
  }
  return url.origin;
}

async function viuApi(path, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await viuSaved();
      if (!saved.apiBaseUrl) throw new Error('Viu API is not configured');
      const headers = new Headers(init.headers || {});
      if (saved.bootstrapToken) headers.set('x-viu-flow-token', saved.bootstrapToken);
      const response = await fetch(`${viuLocalBase(saved.apiBaseUrl)}${path}`, { ...init, headers });
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      return response.status === 204 ? null : response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await viuSleep(400 * (attempt + 1));
    }
  }
  throw lastError;
}

async function viuWorkerId() {
  const saved = await viuSaved();
  if (saved[VIU_WORKER_KEY]) return saved[VIU_WORKER_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [VIU_WORKER_KEY]: id });
  return id;
}

async function viuFlowTab() {
  const tabs = await chrome.tabs.query({ url: '*://labs.google/fx/*' });
  return tabs.find((tab) => tab.id) || null;
}

async function viuWaitForFlow(tabId, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (pong?.alive) return;
    } catch (_) {}
    await viuSleep(500);
  }
  throw new Error('Google Flow content runtime is not ready');
}

async function viuEnsureRunner() {
  const runnerUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');
  // The untouched 1.1.8 UI needs storage/tabs/scripting APIs, which Chrome's
  // offscreen documents do not expose. Run it in one minimized, unfocused
  // popup window instead: the original engine remains intact but the user sees
  // only Google Flow in the working browser window.
  let runnerTabs = await chrome.tabs.query({ url: `${runnerUrl}*` });
  for (const tab of runnerTabs) {
    if (!tab.id || tab.windowId === undefined) continue;
    const owner = await chrome.windows.get(tab.windowId).catch(() => null);
    if (owner && owner.type !== 'normal' && owner.state === 'minimized') continue;
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
  runnerTabs = await chrome.tabs.query({ url: `${runnerUrl}*` });
  if (!runnerTabs.some((tab) => tab.id)) {
    await chrome.windows.create({
      url: runnerUrl,
      type: 'popup',
      focused: false,
      state: 'minimized',
      width: 420,
      height: 720,
    });
    runnerTabs = await chrome.tabs.query({ url: `${runnerUrl}*` });
  }
  if (!runnerTabs.some((tab) => tab.id)) throw new Error('Cannot create hidden Flow Factory 1.1.8 runtime');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'VAS_RUNNER_PING' });
      if (response?.ok) return;
    } catch (_) {}
    await viuSleep(250);
  }
  throw new Error('Flow Factory 1.1.8 hidden runtime is not ready');
}

function viuSetting(settings, key, fallback) {
  const value = settings?.[key];
  return value === undefined || value === null || value === '' ? fallback : value;
}

async function viuHeartbeat(connection, ready = true) {
  const id = await viuWorkerId();
  await viuApi('/api/flow-connection/factory/state', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      extension_id: id,
      extension_version: chrome.runtime.getManifest().version,
      extension_name: 'Viu + Flow Factory 1.1.8',
      profile_name: 'Viu Flow Chrome profile',
      factory_session_id: connection.factory_session_id || '',
      logged_in: true,
      ready,
    }),
  });
  await viuApi('/api/flow-connection/heartbeat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ extension_id: id, version: chrome.runtime.getManifest().version, logged_in: true, ready }),
  });
  await viuApi('/api/connector/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worker_id: id, version: chrome.runtime.getManifest().version }),
  });
}

async function viuStartOriginalFactory(connection, tasks) {
  let phase = 'load_project';
  try {
  const projectId = connection.factory_project_id;
  const [project, scriptData, globalData] = await Promise.all([
    viuApi(`/api/projects/${projectId}`),
    viuApi(`/api/projects/${projectId}/script`),
    viuApi('/api/global-settings'),
  ]);
  const settings = globalData?.settings || {};
  let projectConfig = {};
  try { projectConfig = typeof project?.config_json === 'string' ? JSON.parse(project.config_json || '{}') : (project?.config_json || {}); } catch (_) {}
  let inheritedConfig = {};
  if (project?.channel_id) {
    try { inheritedConfig = (await viuApi(`/api/channels/${project.channel_id}/config`))?.config || {}; } catch (_) {}
  }
  const projectMedia = {
    ...inheritedConfig,
    ...(projectConfig?.channel || {}),
    ...(projectConfig?.media || {}),
  };
  const imageTaskModel = tasks.find((task) => (task.stage || task.media_type) === 'image')?.model;
  const videoTaskModel = tasks.find((task) => (task.stage || task.media_type) === 'video')?.model;
  const script = String(scriptData?.full_script || '').trim();
  if (script.length < 50) throw new Error('SCRIPT INPUT phải có ít nhất 50 ký tự');
  const imageTaskCount = tasks.filter((task) => (task.stage || task.media_type) === 'image').length;
  const promptCount = imageTaskCount || tasks.length || 4;
  const config = {
    projectId,
    // The Viu project is the only source of truth. Never reuse a global name
    // from another project as if Flow Factory owned a separate project.
    projectName: String(project?.name || `viu_${projectId}`),
    script,
    geminiApiKey: String(viuSetting(settings, 'flow_gemini_api_key', '')),
    nationality: String(viuSetting(settings, 'flow_nationality', 'korean')),
    baseFolder: String(viuSetting(settings, 'flow_base_folder', 'FlowFactory')),
    autoDownloadImagePrompts: viuSetting(settings, 'flow_auto_download_image_prompts', true) !== false,
    autoDownloadVideoPrompts: viuSetting(settings, 'flow_auto_download_video_prompts', true) !== false,
    aspectRatio: String(project?.aspect_ratio || tasks[0]?.aspect || viuSetting(settings, 'flow_ratio', '16:9')),
    imageModel: String(imageTaskModel || projectMedia.image_model || viuSetting(settings, 'flow_image_model', 'Nano Banana 2')),
    imagesPerPrompt: Number(projectMedia.outputs_per_scene || viuSetting(settings, 'flow_output_count', 1)),
    videoModel: String(videoTaskModel || projectMedia.video_model || viuSetting(settings, 'flow_video_model', 'Veo 3.1 Lite')),
    videoResolution: String(viuSetting(settings, 'flow_video_resolution', '1K')),
    delaySeconds: Number(viuSetting(settings, 'flow_prompt_delay', 4)),
    defaultVideoPrompt: String(viuSetting(settings, 'flow_default_video_prompt', 'Dynamic action, Active camera angle')),
    styleId: String(viuSetting(settings, 'flow_style_id', '1')),
    specialDirections: String(viuSetting(settings, 'flow_special_directions', '')),
    // Viu's approved storyboard defines the exact scene count. Uniform split
    // keeps 1.1.8 output S01..SNN aligned with those project scenes.
    splitMode: 'giseungjeongyeol',
    promptCount: Number.isFinite(promptCount) ? promptCount : tasks.length || 4,
    includeVideo: connection.include_video !== false,
    // Revo's project pipeline creates and approves the storyboard before it
    // opens Flow. Viu does the same: hand the approved, project-bound prompts
    // to the untouched 1.1.8 media engine instead of asking Gemini to split
    // the script a second time inside the extension.
    preparedScenes: tasks
      .filter((task) => (task.stage || task.media_type) === 'image')
      .map((task, index) => ({
        number: String(index + 1).padStart(2, '0'),
        prompt: String(task.prompt || '').trim(),
        scriptText: String(task.script_text || '').trim(),
        stylePrompt: String(task.style_prompt || '').trim(),
        videoPrompt: String(task.transition_description || viuSetting(settings, 'flow_default_video_prompt', 'Dynamic action, Active camera angle')).trim(),
        makeVideo: task.make_video === true,
      })),
  };
  phase = 'runner';
  await viuEnsureRunner();
  phase = 'flow_tab';
  const flow = await viuFlowTab();
  if (!flow?.id) throw new Error('Thiếu Google Flow runtime tab');
  await chrome.tabs.update(flow.id, { active: true });
  await viuWaitForFlow(flow.id);
  await viuSleep(1000);
  phase = 'start_engine';
  const response = await chrome.runtime.sendMessage({ type: 'VAS_RUN_FACTORY', config });
  if (!response?.ok) throw new Error(response?.error || 'Flow Factory 1.1.8 refused FULL AUTO');
  await viuApi('/api/flow-connection/factory/state', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      extension_id: await viuWorkerId(),
      extension_version: chrome.runtime.getManifest().version,
      factory_session_id: connection.factory_session_id || '',
      logged_in: true,
      ready: true,
      factory_state: 'processing',
    }),
  });
  } catch (error) {
    throw new Error(`${phase}: ${String(error?.message || error)}`);
  }
}

async function viuPoll() {
  if (viuPolling) return;
  viuPolling = true;
  try {
    const saved = await viuSaved();
    if (!saved.paired || !saved.autoFactory || !saved.apiBaseUrl || !saved.bootstrapToken) return;
    const connection = await viuApi('/api/flow-connection');
    let existingRun = saved[VIU_ACTIVE_FACTORY_KEY];
    if (existingRun) {
      const expired = Date.now() - Number(existingRun.startedAt || 0) > 70 * 60 * 1000;
      const belongsToCurrent = Boolean(
        connection?.factory_project_id
        && Number(existingRun.projectId) === Number(connection.factory_project_id)
        && String(existingRun.factorySessionId || '') === String(connection.factory_session_id || '')
      );
      const runnerUrl = chrome.runtime.getURL('sidepanel/sidepanel.html');
      const runnerTabs = await chrome.tabs.query({ url: `${runnerUrl}*` });
      if (belongsToCurrent && runnerTabs.some((tab) => tab.id) && existingRun.engineStartedAt && !expired) return;
      if (expired && belongsToCurrent) {
        await Promise.all((existingRun.tasks || []).map((task) => viuFail(task, 'Flow Factory quá thời gian 70 phút').catch(() => {})));
      }
      // A previous project/session, or a browser restart that destroyed the
      // hidden 1.1.8 runner, must never block the current project for 70 min.
      await chrome.storage.local.remove(VIU_ACTIVE_FACTORY_KEY);
      existingRun = null;
    }
    // A transient API/browser restart can mark the connection failed before
    // any task is claimed. The backend run/session remains authoritative; let
    // the same project recover instead of leaving it stuck forever.
    if (!connection?.factory_project_id || !['waiting_login', 'ready', 'processing', 'generate_image', 'generate_video', 'failed'].includes(connection.factory_state)) return;
    const flow = await viuFlowTab();
    if (!flow?.id) return;
    await viuHeartbeat(connection, true);
    const tasks = await viuApi(`/api/connector/tasks?worker_id=${encodeURIComponent(await viuWorkerId())}&project_id=${connection.factory_project_id}&factory_session_id=${encodeURIComponent(connection.factory_session_id || '')}`);
    if (!Array.isArray(tasks) || tasks.length === 0) return;
    tasks.sort((a, b) => a.scene_order - b.scene_order);
    const active = {
      projectId: connection.factory_project_id,
      factorySessionId: connection.factory_session_id || '',
      tasks,
      completedTaskIds: [],
      startedAt: Date.now(),
    };
    viuCurrentAttempt = active;
    await chrome.storage.local.set({ [VIU_ACTIVE_FACTORY_KEY]: active });
    await Promise.all(tasks.map((task) =>
      viuProgress(task, 'factory_bootstrap', 1, 'Đang khởi tạo Flow Factory 1.1.8').catch(() => {})
    ));
    await Promise.race([
      viuStartOriginalFactory(connection, tasks),
      viuSleep(45_000).then(() => { throw new Error('Flow Factory 1.1.8 không phản hồi sau 45 giây'); }),
    ]);
    active.engineStartedAt = Date.now();
    await chrome.storage.local.set({ [VIU_ACTIVE_FACTORY_KEY]: active });
    await Promise.all(tasks.map((task) =>
      viuProgress(task, 'factory_start', 5, 'Flow Factory 1.1.8 đã nhận cảnh và bắt đầu FULL AUTO').catch(() => {})
    ));
  } catch (error) {
    const saved = await viuSaved();
    const active = saved[VIU_ACTIVE_FACTORY_KEY] || viuCurrentAttempt;
    await viuApi('/api/flow-connection/factory/state', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extension_id: await viuWorkerId(),
        extension_version: chrome.runtime.getManifest().version,
        factory_session_id: active?.factorySessionId || saved.factorySessionId || '',
        logged_in: true,
        ready: false,
        factory_state: 'failed',
        error: String(error?.message || error || 'Flow Factory failed'),
      }),
    }).catch(() => {});
    if (active?.tasks?.length) {
      // A bootstrap/config/browser error is not a failed scene. Keep every
      // project task and its session intact so the same one-click run can
      // resume after Chrome/Flow recovers. Scene retry counters are reserved
      // for real generation failures reported by the 1.1.8 engine.
      await Promise.all(active.tasks.map((task) =>
        viuProgress(task, 'factory_waiting_retry', 1, String(error?.message || error)).catch(() => {})
      ));
      await chrome.storage.local.remove(VIU_ACTIVE_FACTORY_KEY);
    }
  } finally {
    viuCurrentAttempt = null;
    viuPolling = false;
  }
}

function viuSceneFromFilename(filename) {
  const base = String(filename || '').replace(/\\/g, '/').split('/').pop() || '';
  const match = base.match(/^S(\d{2,3})_/i);
  return match ? Number(match[1]) : 0;
}

async function viuRefreshActiveTasks(active) {
  const pending = await viuApi(`/api/connector/tasks?worker_id=${encodeURIComponent(await viuWorkerId())}&project_id=${active.projectId}&factory_session_id=${encodeURIComponent(active.factorySessionId || '')}`);
  const byId = new Map((active.tasks || []).map((task) => [task.task_id, task]));
  for (const task of Array.isArray(pending) ? pending : []) byId.set(task.task_id, task);
  active.tasks = [...byId.values()].sort((a, b) => a.scene_order - b.scene_order || String(a.stage).localeCompare(String(b.stage)));
  await chrome.storage.local.set({ [VIU_ACTIVE_FACTORY_KEY]: active });
  return active;
}

async function viuProgress(task, phase, percent, message) {
  return viuApi(`/api/connector/tasks/${task.task_id}/progress`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phase, percent, message }),
  });
}

async function viuFail(task, error) {
  return viuApi(`/api/connector/tasks/${task.task_id}/fail`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: String(error?.message || error || 'Flow Factory failed') }),
  });
}

async function viuIngest(message) {
  const saved = await viuSaved();
  let active = saved[VIU_ACTIVE_FACTORY_KEY];
  if (!active?.tasks?.length || !message.url) return;
  const sceneNumber = viuSceneFromFilename(message.filename);
  const isVideo = /\.mp4(?:$|\?)/i.test(String(message.filename || message.url));
  let task = active.tasks.find((item) => item.scene_order + 1 === sceneNumber && ((item.stage || item.media_type) === (isVideo ? 'video' : 'image')));
  if (!task && isVideo) {
    active = await viuRefreshActiveTasks(active);
    task = active.tasks.find((item) => item.scene_order + 1 === sceneNumber && (item.stage || item.media_type) === 'video');
  }
  if (!task || active.completedTaskIds?.includes(task.task_id) || viuUploading.has(task.task_id)) return;
  viuUploading.add(task.task_id);
  try {
    await viuProgress(task, 'download', 88, `Nhận kết quả Flow Factory cho cảnh ${sceneNumber}`);
    const response = await fetch(message.url);
    if (!response.ok) throw new Error(`Flow media HTTP ${response.status}`);
    const blob = await response.blob();
    if (blob.size < 1024) throw new Error('Flow media is empty');
    const form = new FormData();
    form.append('file', blob, `${task.task_id}.${isVideo ? 'mp4' : (blob.type.includes('jpeg') ? 'jpg' : 'png')}`);
    await viuApi(`/api/connector/tasks/${task.task_id}/ingest`, { method: 'POST', body: form });
    let latest = (await viuSaved())[VIU_ACTIVE_FACTORY_KEY];
    if (!latest) return;
    latest.completedTaskIds = [...new Set([...(latest.completedTaskIds || []), task.task_id])];
    // Image completion creates the matching video task in the same backend
    // session. Pull it into this existing 1.1.8 FULL AUTO run instead of
    // launching the script a second time.
    latest = await viuRefreshActiveTasks(latest);
    if (latest.completedTaskIds.length >= latest.tasks.length) {
      await chrome.storage.local.remove(VIU_ACTIVE_FACTORY_KEY);
      setTimeout(() => void viuPoll(), 1000);
    } else {
      await chrome.storage.local.set({ [VIU_ACTIVE_FACTORY_KEY]: latest });
    }
  } catch (error) {
    await viuFail(task, error).catch(() => {});
  } finally {
    viuUploading.delete(task.task_id);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'VAS_BOOTSTRAP' && message.config) {
    chrome.storage.local.set({
      apiBaseUrl: message.config.apiBaseUrl,
      bootstrapToken: message.config.bootstrapToken,
      factorySessionId: message.config.factorySessionId || '',
      paired: true,
      autoFactory: true,
    }).then(() => { sendResponse({ ok: true }); void viuPoll(); })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'DOWNLOAD_FILE') void viuIngest(message);
  if (message?.type === 'VAS_CONFIG_UPDATED') void viuPoll();
  return false;
});

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('viu-factory-poll', { periodInMinutes: 0.25 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('viu-factory-poll', { periodInMinutes: 0.25 }));
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'viu-factory-poll') void viuPoll(); });
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBaseUrl || changes.bootstrapToken || changes.factorySessionId || changes.autoFactory) void viuPoll();
});
setInterval(() => void viuPoll(), 3000);
// Also create/repair the alarm whenever this service worker is evaluated.
// onInstalled/onStartup alone do not cover a manually reloaded unpacked
// extension while the app-owned Chrome process remains open.
void chrome.alarms.create('viu-factory-poll', { periodInMinutes: 0.25 });
void viuPoll();
