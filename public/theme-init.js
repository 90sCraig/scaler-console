try {
  const savedTheme = localStorage.getItem('kramer-theme');
  const supportedThemes = [
    'classic', 'broadcast', 'tp-aquamarine', 'tp-hotline', 'tp-hotpink', 'tp-dracula',
    'tp-dark', 'tp-organizr', 'tp-space-gray', 'tp-overseerr', 'tp-plex', 'tp-nord', 'tp-maroon'
  ];
  if (supportedThemes.includes(savedTheme)) document.documentElement.dataset.theme = savedTheme;
} catch {
  // Storage can be disabled; the default theme still works.
}
