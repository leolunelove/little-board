// Runs before the first paint; it reads only the public route, never board data.
export function openingRouteScript(base = "") {
  return `try{const p=location.pathname.slice(${base.length}).replace(/^\\/+|\\/+$/g,'');if(p==='all'||/^[1-9][0-9]{5}$/.test(p))document.documentElement.dataset.routeLoading='true'}catch{}`;
}
