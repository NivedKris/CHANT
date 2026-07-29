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
  const used = ipUsage.get(ip) || 0;
  
  res.status(200).json({
    remaining: Math.max(0, MAX_TRIES - used),
    max: MAX_TRIES,
    used: used
  });
}

export { ipUsage, MAX_TRIES };
