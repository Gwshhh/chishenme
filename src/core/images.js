const palette = ['#8b4936', '#426357', '#536578', '#795e40', '#7b4e64', '#5e6647'];
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function makeNameCard(value) {
    const name = String(value || '美食').slice(0, 60);
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const label = Array.from(name).slice(0, 12).join('') + (Array.from(name).length > 12 ? '…' : '');
    const size = label.length > 8 ? 24 : label.length > 5 ? 34 : 44;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${palette[hash % palette.length]}"/><g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M172 117h56a28 28 0 0 1-56 0zM193 82c-9 9 9 9 0 18M208 82c-9 9 9 9 0 18"/></g><text x="200" y="195" font-size="${size}" fill="#fff" font-weight="bold" text-anchor="middle" dominant-baseline="central" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(label)}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
