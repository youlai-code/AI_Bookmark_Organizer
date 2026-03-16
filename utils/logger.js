const DEBUG = true;

export function log(...args) {
  if (DEBUG) console.log(...args);
}

export function warn(...args) {
  if (DEBUG) console.warn(...args);
}

export function error(...args) {
  console.error(...args);
}

