CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_ts ON rate_limits (ip, ts);
