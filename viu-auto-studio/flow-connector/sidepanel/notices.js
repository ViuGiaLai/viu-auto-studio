if(typeof console!=="undefined"){console.log=function(){};console.warn=function(){};console.error=function(){};}
/**
 * FLOW FACTORY - Notice System (단일 공지, 원격 토글)
 *
 * Google Sheet 의 단일 행 편집만으로 전체 유저에게 공지 전파.
 * 확장 재배포 불필요.
 *
 * 설계 원칙:
 *   - 단 하나의 공지만 표시 (누적 없음, 관리자 혼동 방지)
 *   - active 체크박스 ON/OFF 로 전원 제어
 *   - 내용 해시 기반 읽음/안읽음 판단 (같은 내용 재토글 시 스팸 방지)
 *   - 24시간 캐시, fetch 실패 시 이전 캐시 사용
 *   - innerHTML 금지, textContent 만 (XSS 방지, CWS 정책)
 *
 * 구글시트 스키마 (1행 헤더, 2행 데이터):
 *   A: active (checkbox) | B: ko_title | C: en_title | D: ko_body | E: en_body | F: link
 *
 * Apps Script 응답:
 *   { notice: {ko: {title, body}, en: {title, body}, link} | null }
 */
(function () {
    'use strict';

    const CACHE_KEY = 'ff_notice_cache';        // { notice, fetchedAt }
    const READ_HASH_KEY = 'ff_notice_read_hash'; // 마지막으로 읽은 공지 내용 해시
    const FETCH_TTL_MS = 24 * 60 * 60 * 1000;   // 24시간

    function _getNoticeApiUrl() {
        try {
            if (typeof MONETIZATION_CONFIG === 'undefined') return null;
            const url = MONETIZATION_CONFIG.noticeApiUrl;
            if (!url || typeof url !== 'string' || !url.trim()) return null;
            return url.trim();
        } catch { return null; }
    }

    function _t(key, fallback) {
        if (typeof t === 'function') {
            try { return t(key, fallback); } catch {}
        }
        return fallback;
    }

    function _currentLang() {
        try {
            if (typeof APP !== 'undefined' && APP.lang) return APP.lang;
        } catch {}
        return 'en';
    }

    // 내용 기반 해시 — 같은 내용 토글 시 "다시 읽어야 함" 오류 방지
    function _hashNotice(notice) {
        if (!notice) return '';
        const s = [
            notice.ko?.title || '',
            notice.ko?.body || '',
            notice.en?.title || '',
            notice.en?.body || '',
            notice.link || '',
            // force_popup 플래그 포함 → 관리자가 체크박스 토글하면 해시 변경
            //   → 이미 읽은 유저에게도 자동 팝업 재발동 (설계 의도)
            notice.forcePopup ? 'FP:1' : 'FP:0'
        ].join('||');
        // 간단 해시 (충돌 확률 낮음, 보안용 아님)
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return String(h);
    }

    async function _getCache() {
        try {
            const r = await chrome.storage.local.get(CACHE_KEY);
            return r[CACHE_KEY] || null;
        } catch { return null; }
    }

    async function _setCache(notice) {
        try {
            await chrome.storage.local.set({
                [CACHE_KEY]: { notice, fetchedAt: Date.now() }
            });
        } catch {}
    }

    async function _getReadHash() {
        try {
            const r = await chrome.storage.local.get(READ_HASH_KEY);
            return r[READ_HASH_KEY] || '';
        } catch { return ''; }
    }

    async function _setReadHash(hash) {
        try { await chrome.storage.local.set({ [READ_HASH_KEY]: hash }); } catch {}
    }

    // ─────────────────────────────────────────────────────────────
    // 강제 fetch — 벨 클릭 시 사용. TTL 무시, 항상 최신 서버 응답
    //   실패 시 기존 캐시 유지 (덮어쓰지 않음)
    // ─────────────────────────────────────────────────────────────
    async function fetchNoticeNow() {
        const url = _getNoticeApiUrl();
        if (!url) return;
        try {
            // ★ v1.1.2: background service worker 경유 fetch (CORS 우회)
            const resp = await chrome.runtime.sendMessage({ type: 'FETCH_PROXY', url });
            if (!resp?.ok) throw new Error('HTTP ' + (resp?.status || 'error'));
            const data = JSON.parse(resp.body);
            const notice = (data && typeof data === 'object' && data.notice) ? data.notice : null;
            await _setCache(notice);
        } catch (e) {
            console.log('[Notices] bell fetch failed (keeping cache):', e?.message || e);
            // 실패 → 기존 캐시 유지
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Fetch — 24시간 캐시 (초기 로드용)
    // ─────────────────────────────────────────────────────────────
    async function fetchNoticeIfStale() {
        const cached = await _getCache();
        const now = Date.now();
        if (cached && cached.fetchedAt && (now - cached.fetchedAt) < FETCH_TTL_MS) {
            return cached.notice || null;
        }
        const url = _getNoticeApiUrl();
        if (!url) {
            // URL 미설정 → 조용히 캐시 반환 (있으면)
            return cached?.notice || null;
        }
        try {
            // ★ v1.1.2: background service worker 경유 fetch (CORS 우회)
            const resp = await chrome.runtime.sendMessage({ type: 'FETCH_PROXY', url });
            if (!resp?.ok) throw new Error('HTTP ' + (resp?.status || 'error'));
            const data = JSON.parse(resp.body);
            const notice = (data && typeof data === 'object' && data.notice) ? data.notice : null;
            await _setCache(notice);
            return notice;
        } catch (e) {
            console.log('[Notices] fetch failed, using cache:', e?.message || e);
            return cached?.notice || null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 벨 빨간 점 업데이트
    // ─────────────────────────────────────────────────────────────
    async function updateBellIndicator() {
        const cached = await _getCache();
        const notice = cached?.notice || null;
        const readHash = await _getReadHash();
        const currentHash = _hashNotice(notice);
        const bell = document.getElementById('notice-bell');
        const dot = bell?.querySelector('.notice-dot');
        if (!bell || !dot) return;
        const isUnread = !!(notice && currentHash && currentHash !== readHash);
        // 공지 있음 + 아직 안 읽음 → 빨간 점 + 종 전체 핑크 펄스
        if (isUnread) {
            dot.classList.remove('hidden');
            bell.classList.add('unread');       // ★ v1.1.6: 종 전체 핑크 깜박임
        } else {
            dot.classList.add('hidden');
            bell.classList.remove('unread');    // 확인 완료 → 펄스 중단
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 모달 렌더 (innerHTML 금지 — textContent 만)
    // ─────────────────────────────────────────────────────────────
    async function renderModal() {
        const list = document.getElementById('notice-modal-list');
        const updatedEl = document.getElementById('notice-modal-updated');
        if (!list) return;
        list.replaceChildren();

        const cached = await _getCache();
        const notice = cached?.notice || null;
        const lang = _currentLang();

        if (!notice) {
            const p = document.createElement('p');
            p.className = 'notice-empty';
            p.textContent = _t('noticeEmpty', '새 소식이 없습니다.');
            list.appendChild(p);
        } else {
            const item = document.createElement('article');
            item.className = 'notice-item';

            const title = document.createElement('h3');
            title.className = 'notice-title';
            title.textContent = (notice[lang]?.title) || (notice.en?.title) || (notice.ko?.title) || '';
            item.appendChild(title);

            const body = document.createElement('p');
            body.className = 'notice-body';
            body.textContent = (notice[lang]?.body) || (notice.en?.body) || (notice.ko?.body) || '';
            item.appendChild(body);

            if (notice.link && typeof notice.link === 'string' && /^https?:\/\//i.test(notice.link)) {
                const a = document.createElement('a');
                a.className = 'notice-link';
                a.href = notice.link;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                // 링크 라벨 우선순위:
                //   1. 현재 언어의 link_label (ko.linkLabel / en.linkLabel)
                //   2. 반대 언어 link_label (fallback)
                //   3. URL 의 도메인명 자동 추출 (DAPARAFACTORY.AI 형식)
                let label = (notice[lang]?.linkLabel || '').trim();
                if (!label) {
                    const other = lang === 'ko' ? 'en' : 'ko';
                    label = (notice[other]?.linkLabel || '').trim();
                }
                if (!label) {
                    try {
                        const u = new URL(notice.link);
                        label = u.hostname.replace(/^www\./i, '').toUpperCase();
                    } catch {
                        label = notice.link;
                    }
                }
                a.textContent = label;
                item.appendChild(a);
            }
            list.appendChild(item);
        }

        if (updatedEl) {
            if (cached?.fetchedAt) {
                const d = new Date(cached.fetchedAt);
                // UI 언어에 맞는 BCP-47 locale 로 포맷 (APP.lang: ko/en/ja/...)
                const langMap = {
                    'ko': 'ko-KR', 'en': 'en-US', 'ja': 'ja-JP',
                    'vi': 'vi-VN', 'zh-CN': 'zh-CN', 'es': 'es-ES',
                    'pt-BR': 'pt-BR', 'id': 'id-ID'
                };
                const uiLang = (typeof APP !== 'undefined' && APP.lang) ? APP.lang : 'en';
                const localeTag = langMap[uiLang] || 'en-US';
                updatedEl.textContent = `${_t('noticeUpdatedAt', '업데이트')}: ${d.toLocaleString(localeTag)}`;
            } else {
                updatedEl.textContent = '';
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 모달 열기 / 닫기
    // ─────────────────────────────────────────────────────────────
    async function openModal() {
        // ★ 벨 클릭 / 자동 팝업 시 항상 서버에서 최신 공지 가져오기
        //   - 만료 개념 없이, 수동 열람은 항상 실시간 내용
        //   - 실패하면 기존 캐시로 fallback (fetchNoticeNow 내부 처리)
        await fetchNoticeNow();

        await renderModal();
        const modal = document.getElementById('notice-modal');
        if (modal) modal.classList.remove('hidden');
        // 읽음 처리 — 현재 캐시의 해시 저장 (벨 빨간점 숨김용)
        const cached = await _getCache();
        const hash = _hashNotice(cached?.notice);
        if (hash) await _setReadHash(hash);
        await updateBellIndicator();
    }

    function closeModal() {
        const modal = document.getElementById('notice-modal');
        if (modal) modal.classList.add('hidden');
    }

    // ─────────────────────────────────────────────────────────────
    // 바인딩 & 초기화
    // ─────────────────────────────────────────────────────────────
    function bindEvents() {
        const bell = document.getElementById('notice-bell');
        if (bell && !bell._boundNotice) {
            bell._boundNotice = true;
            bell.addEventListener('click', openModal);
        }
        const close = document.getElementById('notice-modal-close');
        if (close && !close._boundNotice) {
            close._boundNotice = true;
            close.addEventListener('click', closeModal);
        }
        const backdrop = document.querySelector('#notice-modal .notice-modal-backdrop');
        if (backdrop && !backdrop._boundNotice) {
            backdrop._boundNotice = true;
            backdrop.addEventListener('click', closeModal);
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('notice-modal');
                if (modal && !modal.classList.contains('hidden')) closeModal();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // 강제 팝업 — forcePopup=TRUE 인 새 공지 있으면 자동 모달 오픈
    //   쿨다운: 같은 내용(동일 해시)로는 재팝업 안 함 (유저 피로 방지)
    //   관리자가 내용 수정 → 해시 변경 → 전 유저에게 다시 자동 팝업
    //   ★ 첫 설치 안내(essential-setup-modal) 표시 중이면 대기 → 닫힌 후 자동 팝업
    // ─────────────────────────────────────────────────────────────
    function _isEssentialSetupVisible() {
        const el = document.getElementById('essential-setup-modal');
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && !el.classList.contains('hidden');
    }

    // 첫 유저 인터랙션(아무 클릭) 후 공지 모달 오픈 — 덜 방해적
    //   - 사이드패널 열자마자 팝업이 뜨면 부담 → 본인이 뭔가 한 후 보도록
    //   - 클릭이 벨 아이콘이면 이미 모달 오픈 → 중복 방지
    //   - 한 번만 발동 (once: true)
    function _waitForFirstInteractionThenOpen() {
        const handler = (e) => {
            // 벨/공지 모달 내부 클릭은 무시 (자기 자신 트리거 방지)
            const bell = document.getElementById('notice-bell');
            const modal = document.getElementById('notice-modal');
            if (bell && bell.contains(e.target)) return;  // 벨 자체 핸들러가 처리
            if (modal && modal.contains(e.target)) return;
            document.removeEventListener('click', handler, true);
            setTimeout(() => openModal(), 150);
        };
        document.addEventListener('click', handler, true);
    }

    async function autoOpenIfForced() {
        const cached = await _getCache();
        const notice = cached?.notice || null;
        if (!notice || !notice.forcePopup) return;
        const currentHash = _hashNotice(notice);
        const readHash = await _getReadHash();
        if (!currentHash || currentHash === readHash) return;  // 이미 읽은 내용

        // 첫 설치 안내가 열려있으면 그게 닫힐 때까지 대기 후 인터랙션 기다림
        if (_isEssentialSetupVisible()) {
            const observer = new MutationObserver(() => {
                if (!_isEssentialSetupVisible()) {
                    observer.disconnect();
                    _waitForFirstInteractionThenOpen();
                }
            });
            observer.observe(document.getElementById('essential-setup-modal'), {
                attributes: true, attributeFilter: ['style', 'class']
            });
            return;
        }
        // essential-setup 없음 → 바로 첫 인터랙션 대기
        _waitForFirstInteractionThenOpen();
    }

    async function initNotices() {
        bindEvents();
        await updateBellIndicator();   // 캐시 기반 즉시 업데이트 (빠른 피드백)
        // ★ 항상 최신 fetch — force_popup 토글 즉시 반영
        //   이전엔 24h TTL 때문에 관리자 변경이 최대 24시간 늦게 적용됨
        //   매 사이드패널 오픈 시 1회 fetch (Google Apps Script 20k/day 내)
        fetchNoticeNow().then(async () => {
            await updateBellIndicator();
            await autoOpenIfForced();  // force_popup + 새 내용이면 자동 모달
        });
    }

    // window 노출
    window.initNotices = initNotices;
    window.openNoticeModal = openModal;
    window.closeNoticeModal = closeModal;
    window.refreshNoticeIndicator = updateBellIndicator;
})();
