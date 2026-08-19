// flow-selectors.js — Flow Connector: DOM selectors for labs.google/fx (learned from Auto Flow Factory 1.1.8)
// Chạy trong content script của trang labs.google/fx

window.__VAS_SELECTORS = {
  // Tabs model settings
  IMAGE_TAB: 'button[id*="trigger-IMAGE"]',
  VIDEO_TAB: 'button[id*="trigger-VIDEO"]',
  LANDSCAPE: 'button[id*="trigger-LANDSCAPE"]',
  PORTRAIT: 'button[id*="trigger-PORTRAIT"]',
  COUNT_X1: 'button[id*="trigger-1"]',
  COUNT_X2: 'button[id$="trigger-2"]',

  // Editor & submit
  PROMPT_INPUT: '[contenteditable="true"][data-slate-editor="true"]',
  SUBMIT_ICON: 'i.google-symbols',

  // Tile tracking
  TILE: '[data-tile-id]',
  TILE_IMG: '[data-tile-id] img',

  // Tile done signal: img src chứa getMediaUrlRedirect
  DONE_URL_KEY: 'getMediaUrlRedirect',
  PROGRESS_REGEX: /(\d+)%/,

  // Media download URL
  MEDIA_URL: 'https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=',
  FLOW_PAGE: 'labs.google/fx',

  // Text patterns (đa ngôn ngữ, ưu tiên tiếng Việt vì người dùng đặt UI Flow tiếng Việt)
  NEW_PROJECT_TEXTS: [
    'Dự án mới', 'Tạo dự án', 'Dự án Mới', 'tạo dự án mới',
    'New project', 'Create project', 'Start new project',
    '새 프로젝트', '프로젝트 만들기', '새로운 프로젝트',
    '新しいプロジェクト', '新建项目', '新项目',
    'Nuevo proyecto', 'Créer un projet', 'Neues Projekt',
    'Новый проект', 'Nuovo progetto', 'Proyek baru',
  ],
  PROJECT_KEYWORDS: [
    'dự án', 'project', 'proyecto', 'projet', 'projekt',
    'progetto', 'projeto', 'proyek', 'プロジェクト',
    '项目', '項目', '專案', 'проект', 'مشروع', 'प्रोजेक्ट',
  ],

  // Image models
  IMAGE_MODELS: ['Nano Banana Pro', 'Nano Banana 2', 'Nano Banana 2 Lite', 'Gemma Flash'],
  // Video models
  VIDEO_MODELS: ['Veo 3.1', 'Veo 3.1 Lite', 'Veo 3'],
};
