/** Script inline no <head> — evita flash de tema errado antes da hidratação. */
export const THEME_INIT_SCRIPT = `(function(){try{var k='svlotes-theme';var t=localStorage.getItem(k);var m=t==='light'?'light':'dark';document.documentElement.setAttribute('data-theme',m);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export const THEME_STORAGE_KEY = 'svlotes-theme';
