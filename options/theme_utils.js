
function applyTheme(theme) {
  const root = document.documentElement;
  
  if (theme === 'auto') {
      // Remove class to rely on media query if we had one, but better to detect
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
          root.classList.add('dark-mode');
      } else {
          root.classList.remove('dark-mode');
      }
  } else if (theme === 'dark') {
      root.classList.add('dark-mode');
  } else {
      root.classList.remove('dark-mode');
  }
}

// Listen for system theme changes if auto
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = document.getElementById('theme')?.value || 'auto';
        if (currentTheme === 'auto') {
            const root = document.documentElement;
            if (e.matches) {
                root.classList.add('dark-mode');
            } else {
                root.classList.remove('dark-mode');
            }
        }
    });
}
