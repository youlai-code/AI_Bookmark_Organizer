export function resolveEndpoint(base, suffix) {
  let url = base;
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (!url.endsWith(suffix)) url += suffix;
  return url;
}
