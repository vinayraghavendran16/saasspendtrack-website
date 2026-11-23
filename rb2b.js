(() => {
  if (window.reb2b) return;
  window.reb2b = { loaded: true };

  const key = '9NMMZHXZ35NW';
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://ddwl4m2hdecbv.cloudfront.net/b/${key}/${key}.js.gz`;
  document.head.append(script);
})();
