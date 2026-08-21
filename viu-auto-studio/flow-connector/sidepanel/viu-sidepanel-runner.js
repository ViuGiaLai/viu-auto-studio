// Viu invokes the original Flow Factory 1.1.8 sidepanel as the offscreen
// document itself. Running it directly preserves chrome.storage/runtime APIs;
// wrapping an extension page in an iframe does not.
(function installViuSidepanelRunner() {
  globalThis.__VIU_RUNNER_VERSION = '1.1.8.13';
  globalThis.__VIU_RUNNER_LAST = { state: 'loaded', at: Date.now() };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitForFactoryUi(timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (document.querySelector('#btn-full-auto') && document.querySelector('#scriptInput')) return;
      await sleep(250);
    }
    throw new Error('Flow Factory 1.1.8 UI did not initialize');
  }

  function setValue(selector, value) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.value = value == null ? '' : String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function preparedPrompt(scene, index) {
    const visual = String(scene.prompt || '').trim();
    const style = String(scene.stylePrompt || '').trim();
    return {
      number: String(scene.number || index + 1).padStart(2, '0'),
      characters: 'BG',
      scriptText: String(scene.scriptText || '').trim(),
      sceneDesc: visual,
      charProps: style,
      action: visual,
      prompt: [visual, style].filter(Boolean).join('. '),
      videoPrompt: String(scene.videoPrompt || 'Dynamic action, Active camera angle').trim(),
      makeVideo: scene.makeVideo === true,
    };
  }

  async function runVideoQueueToCompletion() {
    // Flow can finish a batch with a mixture of completed, failed and still
    // pending videos (for example after a transient generation/card error).
    // In Viu Factory mode there is no user waiting to press "retry failed",
    // so continue the original 1.1.8 engine automatically until every item is
    // complete or the bounded retry budget is exhausted.
    for (let pass = 1; pass <= 4; pass += 1) {
      APP.factory.videoGenerationComplete = false;
      APP.factory.isProcessing = true;
      await startVideoGeneration();
      while (APP.factory.videoRunning) await sleep(1000);
      const unfinished = APP.factory.videoQueue.filter((item) =>
        ['pending', 'failed', 'generating'].includes(item.status) && item.imageBase64
      );
      if (!unfinished.length) {
        globalThis.__VIU_RUNNER_LAST = {
          state: 'video_generation_completed', count: APP.factory.videoQueue.length, at: Date.now(),
        };
        return;
      }
      if (pass === 4) {
        globalThis.__VIU_RUNNER_LAST = {
          state: 'video_generation_incomplete', remaining: unfinished.length, at: Date.now(),
        };
        return;
      }
      unfinished.forEach((item) => { item.status = 'pending'; });
      renderVideoPromptList();
      updateVideoProgressBar();
      globalThis.__VIU_RUNNER_LAST = {
        state: 'video_generation_retry', pass: pass + 1, remaining: unfinished.length, at: Date.now(),
      };
      await sleep(1500);
    }
  }

  async function continuePreparedVideo(prompts, includeVideo) {
    if (!includeVideo) return;
    const videoPrompts = prompts.filter((prompt) => prompt.makeVideo);
    if (!videoPrompts.length) return;
    const deadline = Date.now() + 60 * 60 * 1000;
    while (Date.now() < deadline && !APP.factory.imageGenerationComplete) await sleep(1000);
    if (!APP.factory.imageGenerationComplete) return;

    const sceneItems = APP.queue.filter((item) => item.type !== 'characterRef');
    APP.factory.videoPrompts = videoPrompts.map((prompt) => ({
      number: prompt.number,
      characters: prompt.characters || 'BG',
      scriptText: prompt.scriptText || '',
      videoPrompt: prompt.videoPrompt || 'Dynamic action, Active camera angle',
    }));
    APP.factory.videoQueue = videoPrompts.map((prompt) => {
      const image = sceneItems.find((item) => String(item.number).padStart(2, '0') === prompt.number) || {};
      return {
        number: prompt.number,
        characters: prompt.characters || 'BG',
        scriptText: prompt.scriptText || '',
        imageBase64: image.imageBase64 || '',
        thumbnail: image.imageBase64 || '',
        originalFilename: image.imageFilename || '',
        prompt: prompt.videoPrompt || 'Dynamic action, Active camera angle',
        status: image.imageBase64 ? 'pending' : 'skipped',
        editMode: false,
      };
    });
    renderVideoPromptList();
    updateGeneratedVideoPromptsText();
    document.querySelector('#generatedVideoPromptsSection')?.classList.remove('hidden');
    document.querySelector('#section-factory-video')?.classList.remove('hidden');
    APP.factory.isVideoAuto = true;
    await runVideoQueueToCompletion();
  }

  async function runPreparedProject(config) {
    globalThis.__VIU_RUNNER_LAST = { state: 'prepared_received', count: config.preparedScenes?.length || 0, at: Date.now() };
    const prompts = config.preparedScenes.map(preparedPrompt).filter((item) => item.prompt);
    if (!prompts.length) throw new Error('Dự án Viu chưa có visual prompt đã duyệt');

    document.querySelector('[data-mode="factory"]')?.click();
    setValue('#controlProjectName', config.projectName || 'viu_project');
    setValue('#scriptInput', config.script || '');
    APP.prompts = prompts;
    APP.characterRefs = [];
    APP.characterRefAssets = null;
    APP.queue = prompts.map((prompt) => ({
      text: prompt.prompt,
      status: 'ready',
      type: 'scene',
      number: prompt.number,
      characters: prompt.characters,
      scriptText: prompt.scriptText,
    }));
    APP.factory.projectName = config.projectName || 'viu_project';
    APP.factory.isFullAuto = true;
    // Viu already completed SCRIPT -> PROMPTS. Keep 1.1.8 automatic for
    // PROMPTS -> IMAGES -> VIDEOS, while bypassing only the duplicate Gemini
    // prompt-generation step.
    APP.factory.isAutoMode = false;
    APP.factory.isVideoAuto = true;
    APP.factory.isProcessing = true;
    showGeneratedPrompts(prompts, false, prompts.length);
    showQueue();
    updateStartButtonState();
    saveSession();
    if (config.autoDownloadImagePrompts !== false) triggerImagePromptsDownload();
    void continuePreparedVideo(prompts, config.includeVideo !== false);
    await startGeneration();
    globalThis.__VIU_RUNNER_LAST = { state: 'image_generation_started', count: prompts.length, project: config.projectName || '', at: Date.now() };
    return { ok: true, prepared: true, count: prompts.length };
  }

  async function runFactory(config) {
    await waitForFactoryUi();
    const current = await chrome.storage.local.get(['grokSettings', 'apiKey']);
    const grokSettings = {
      ...(current.grokSettings || {}),
      nationality: config.nationality || 'korean',
      downloadFolder: config.baseFolder || 'FlowFactory',
      aspectRatio: config.aspectRatio || '16:9',
      direction: config.aspectRatio === '9:16' ? 'portrait' : 'landscape',
      flowImageModel: config.imageModel || 'Nano Banana 2',
      outputCount: Number(config.imagesPerPrompt) === 2 ? 2 : 1,
      flowVideoModel: config.videoModel || 'Veo 3.1 Lite',
      videoResolution: config.videoResolution || '1K',
      delay: Math.max(0, Number(config.delaySeconds) || 4),
      defaultVideoPrompt: config.defaultVideoPrompt || 'Dynamic action, Active camera angle',
      selectedStyle: config.styleId || '1',
      autoDownloadImagePrompts: config.autoDownloadImagePrompts !== false,
      autoDownloadVideoPrompts: config.autoDownloadVideoPrompts !== false,
    };
    const values = {
      grokSettings,
      savedScript: config.script || '',
      splitMode: config.splitMode || 'giseungjeongyeol',
      lastUserNumPrompts: String(config.promptCount || 4),
    };
    if (config.geminiApiKey) values.apiKey = config.geminiApiKey;
    await chrome.storage.local.set(values);
    if (Array.isArray(config.preparedScenes) && config.preparedScenes.length) {
      return runPreparedProject(config);
    }
    if (!config.geminiApiKey && !current.apiKey) {
      throw new Error('Chưa có Gemini API Key trong Viu hoặc Flow Factory 1.1.8');
    }

    // Reloading the fields after storage is updated keeps the untouched 1.1.8
    // handlers and their internal state aligned with the Viu project.
    document.querySelector('[data-mode="factory"]')?.click();
    setValue('#controlProjectName', config.projectName || 'viu_project');
    setValue('#scriptInput', config.script || '');
    setValue('#userDirections', config.specialDirections || '');
    setValue('#splitMode', config.splitMode || 'giseungjeongyeol');
    setValue('#numPrompts', String(config.promptCount || 4));
    await sleep(300);
    const button = document.querySelector('#btn-full-auto');
    if (!button) throw new Error('FULL AUTO button is missing');
    button.click();
    return { ok: true };
  }

  globalThis.__VIU_RESUME_FACTORY_VIDEOS = runVideoQueueToCompletion;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'VAS_RUNNER_PING') {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type !== 'VAS_RUN_FACTORY') return false;
    runFactory(message.config || {})
      .then((response) => {
        globalThis.__VIU_RUNNER_LAST = { ...globalThis.__VIU_RUNNER_LAST, response, at: Date.now() };
        sendResponse(response);
      })
      .catch((error) => {
        globalThis.__VIU_RUNNER_LAST = { state: 'error', error: String(error?.message || error), at: Date.now() };
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  });
})();
