// Cloudflare Worker entry point.
//
// Why this file exists:
// The repo was written for Cloudflare PAGES, where functions/api/video-download/
// is auto-detected. The newer WORKERS flow does not read functions/, so that
// proxy must be re-registered here.
//
// What it does:
//  - /api/video-download  -> proxy the finished video, adding CORS headers
//  - everything else      -> serve the static Next.js export from ./out
//
// Agnes' output domain sends no CORS headers, so the browser cannot fetch the
// clip as a Blob for ffmpeg.wasm stitching. This proxy is what makes
// stitch/export work.

const ALLOWED_HOSTS = [
  'platform-outputs.agnes-ai.space',
  'platform-outputs.agnes-ai.com',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function videoDownload(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!targetUrl) return json({ error: 'Missing url parameter' }, 400);

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return json({ error: 'Invalid url' }, 400);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return json({ error: 'Host not allowed' }, 403);
  }

  const upstream = await fetch(targetUrl, {
    headers: { 'User-Agent': 'free-short-video-studio/1.0' },
  });

  if (!upstream.ok || !upstream.body) {
    return json({ error: `Upstream ${upstream.status}` }, upstream.status || 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': upstream.headers.get('Content-Type') || 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/video-download') return videoDownload(request);
    return env.ASSETS.fetch(request);
  },
};
