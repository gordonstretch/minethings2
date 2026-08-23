function machineGlyph(type) {
  const pipeMatch = /^pipe(200|400|600|800|1000)$/.exec(type);
  if (pipeMatch) {
    const angle = (-90 + Number(pipeMatch[1]) / 100 * 30) * Math.PI / 180;
    const x = (Math.cos(angle) * 20).toFixed(2);
    const y = (Math.sin(angle) * 20).toFixed(2);
    return `<path d="M0-22V0L${x} ${y}M-3-19 0-22 3-19"/>`;
  }
  if (/^(short|long)(in|out)$/.test(type)) {
    const outward = type.endsWith('out');
    const length = type.startsWith('long') ? 25 : 20;
    const arrowY = outward ? -length : 0;
    const arrowDirection = outward ? 3 : -3;
    return `<path d="M0 ${-length}V0M-3 ${arrowY + arrowDirection} 0 ${arrowY} 3 ${arrowY + arrowDirection}"/>`;
  }
  switch (type) {
    case 'pump': return '<circle r="6"/><circle r="2" fill="currentColor" stroke="none"/>';
    case 'pad': return '<rect x="-7" y="-7" width="14" height="14" rx="1"/><path d="M-4 0H4M0-4V4"/>';
    case 'power': return '<path d="M0-10 5 7H-5Z"/><path d="M0-5V3"/>';
    case 'double': return '<path d="M-4-10 1 7H-9ZM5-7 10 10H0Z"/>';
    case 'beepy': return '<circle r="5"/><circle cy="-21" r="2"/><circle cx="18" cy="-10" r="2"/><circle cx="18" cy="10" r="2"/><circle cy="21" r="2"/><circle cx="-18" cy="10" r="2"/><circle cx="-18" cy="-10" r="2"/>';
    case 'reaper': return '<path d="M-4-5 0-12 4-5M0 0 19-11M0 0 19 11M0 0V22M0 0-19 11M0 0-19-11"/><circle cx="19" cy="-11" r="2"/><circle cx="19" cy="11" r="2"/><circle cy="22" r="2"/><circle cx="-19" cy="11" r="2"/><circle cx="-19" cy="-11" r="2"/>';
    case 'harvester': return '<path d="M-4-5 0-12 4-5M0 0 19-11M0 0 19 11M0 0V22M0 0-19 11M0 0-19-11"/>';
    case 'pump-pipe': return '<circle r="6"/><path d="M0-6V-23M-3-20 0-23 3-20"/>';
    case 'pad-pipe': return '<rect x="-6" y="-6" width="12" height="12"/><path d="M0-6V-23M-3-9 0-6 3-9"/>';
    case 'funnel': return '<path d="M0 0V-23M-3-20 0-23 3-20M0 0 19 11M0 0V20M0 0-19 11"/>';
    case 'vacuum': return '<rect x="-6" y="-6" width="12" height="12"/><path d="M0-6V-22M6-6 18-13M6 6 18 13M0 6V22M-6 6-18 13M-6-6-18-13"/>';
    case 'horizon': return '<rect x="-6" y="-6" width="12" height="12"/><path d="M0-6V-20M4-5 10-17M6-3 17-10M6 0H20M6 3 17 10M4 5 10 17M0 6V20M-4 5-10 17M-6 3-17 10M-6 0H-20M-6-3-17-10M-4-5-10-17"/>';
    case 'siphon': return '<path d="M-7-7 7 7M7-7-7 7M-5 0H5M0 0V-23M-3-20 0-23 3-20"/>';
    case 'pelter': return '<rect x="-5" y="-8" width="10" height="10"/><path d="M0 2V10"/><rect x="-3" y="10" width="6" height="5"/><circle cy="-14" r="2" fill="currentColor"/>';
    case 'mallet': return '<rect x="-3" y="-9" width="6" height="18"/><rect x="-8" y="-10" width="16" height="5" fill="currentColor"/>';
    case 'zapper': return '<path d="M-4-10V8L7 11V6L-1 4V-10ZM3 6V2L0-1"/><path d="M-10-14-5-9M0-16V-10M10-14 5-9"/>';
    case 'grinder': return '<circle r="7"/><path d="M0-16V-8M14-8 7-4M14 8 7 4M0 16V8M-14 8-7 4M-14-8-7-4"/>';
    case 'turret': return '<circle r="9"/><circle r="5"/><circle r="2" fill="currentColor"/><path d="M0-16V-10M16 0H10M0 16V10M-16 0H-10"/>';
    case 'crane': return '<path d="M-2 9V-11M2 9V-11M-10-11H11V2"/><rect x="-11" y="-12" width="3" height="3" fill="currentColor"/><path d="M8 2H14M11 2V9"/>';
    case 'flak': return '<path d="M-11 7H11M-5 7V-2L14-9M-5-4 1-7M-5 0 1-3"/>';
    case 'drone': return '<circle cy="-4" r="6" fill="currentColor"/><path d="M0 2 6 9M0 2V8M0 2-6 9M-11-10-6-6M11-10 6-6"/>';
    case 'welder': return '<rect x="-4" y="-4" width="8" height="13" fill="currentColor"/><path d="M0-4V-21M-5-17 0-21 5-17"/>';
    case 'flower': return '<ellipse rx="6" ry="11"/><path d="M-5 5-10 10H10L5 5"/><text x="0" y="3" text-anchor="middle" stroke="none" fill="currentColor" font-size="8" font-family="Arial">F</text>';
    case 'thumper': return '<ellipse rx="7" ry="12"/><path d="M-6 6-11 11H11L6 6"/><text x="0" y="3" text-anchor="middle" stroke="none" fill="currentColor" font-size="8" font-family="Arial">T</text>';
    default: return '<circle r="10"/><path d="M-4-3C-4-9 6-9 6-3 6 1 1 1 1 6M1 11V12"/>';
  }
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

export function machineIconPath(type, rarity) {
  if (!type) return null;
  const rarityId = Number(rarity);
  if (!Number.isSafeInteger(rarityId) || rarityId < 0) return null;
  return `/node/machine-icons/${encodeURIComponent(type)}-${rarityId}.svg`;
}

export function machineIconSvg(type, rarity, rarityColours, displayName = null) {
  if (!type || !Array.isArray(rarityColours) || !rarityColours.length) return null;
  const rarityId = Number(rarity);
  if (!Number.isSafeInteger(rarityId) || rarityId < 0
    || typeof rarityColours[rarityId] !== 'string' || !rarityColours[rarityId]) return null;
  const title = displayName === null
    ? type.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
    : String(displayName);
  const colour = rarityColours[rarityId];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><title>${escapeXml(title)} machine</title><path d="M32 2 58 17v30L32 62 6 47V17Z" fill="${escapeXml(colour)}" stroke="#443825" stroke-width="2"/><g transform="translate(32 32)" fill="none" stroke="#fff8df" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" color="#fff8df">${machineGlyph(type)}</g></svg>`;
}
