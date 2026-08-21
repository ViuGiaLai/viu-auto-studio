// Bootstrap bridge for Viu Auto Studio.
(function bootstrapViuFlow() {
  const marker = '#vas-bootstrap=';
  const hash = String(window.location.hash || '');
  const index = hash.indexOf(marker);
  if (index < 0) return;
  try {
    const encoded = hash.slice(index + marker.length).split('&')[0];
    const config = JSON.parse(decodeURIComponent(encoded));
    void chrome.runtime.sendMessage({ type: 'VAS_BOOTSTRAP', config }).then(() => {
      history.replaceState(null, document.title, `${location.pathname}${location.search}`);
    });
  } catch (_) {
    // Electron also injects this config into the service worker.
  }
})();
