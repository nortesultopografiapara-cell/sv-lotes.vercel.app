/** Script inline no <head> — evita flash de tema/marca antes da hidratação. */
export const THEME_INIT_SCRIPT = `(function(){try{var tk='svlotes-theme';var bk='svlotes-brand';var t=localStorage.getItem(tk);var m=t==='light'?'light':'dark';var b=localStorage.getItem(bk);var brands=['orange','blue','green','purple'];var brand=brands.indexOf(b)>=0?b:'orange';var el=document.documentElement;el.setAttribute('data-theme',m);el.setAttribute('data-brand',brand);}catch(e){var el=document.documentElement;el.setAttribute('data-theme','dark');el.setAttribute('data-brand','orange');}})();`;

export const THEME_STORAGE_KEY = 'svlotes-theme';
