const ipUsage = new Map();
const MAX_TRIES = 5;

// Periodic cleanup
setInterval(() => {
  if (ipUsage.size > 1000) {
    ipUsage.clear();
  }
}, 600000);

export default function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const isLocalIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1');
  const host = req.headers.host || '';
  const isDev = isLocalIp || host.includes('localhost') || host.includes('127.0.0.1') || process.env.NODE_ENV !== 'production';

  const used = ipUsage.get(ip) || 0;
  const remaining = isDev ? 9999 : Math.max(0, MAX_TRIES - used);
  
  res.status(200).json({
    remaining: remaining,
    max: isDev ? 9999 : MAX_TRIES,
    used: used
  });
}

export { ipUsage, MAX_TRIES };
