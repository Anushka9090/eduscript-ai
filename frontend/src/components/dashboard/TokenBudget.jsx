import { useState, useEffect } from 'react';
import { rateLimiter } from '../../hooks/useTranscription.js';

export default function TokenBudget() {
  const [budget, setBudget] = useState({ perMin: 3, perDay: 18 });

  useEffect(() => {
    const update = () => setBudget(rateLimiter.remaining());
    update();
    const t = setInterval(update, 5000);
    return () => clearInterval(t);
  }, []);

  const dayPct = Math.round((budget.perDay / rateLimiter.MAX_PER_DAY) * 100);
  const color = dayPct > 50 ? '#10b981' : dayPct > 20 ? '#f59e0b' : '#ef4444';

  return (
    <div style={styles.wrap} title={`API Budget: ${budget.perDay} calls left today · ${budget.perMin} this minute`}>
      <span style={styles.label}>API</span>
      <div style={styles.track}>
        <div style={{ ...styles.fill, width: `${dayPct}%`, background: color }} />
      </div>
      <span style={{ ...styles.count, color }}>{budget.perDay}d</span>
      <span style={styles.sep}>·</span>
      <span style={{ ...styles.count, color: budget.perMin > 0 ? '#94a3b8' : '#ef4444' }}>
        {budget.perMin}m
      </span>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'default' },
  label: { fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' },
  track: { width: 40, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, transition: 'width 0.4s' },
  count: { fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600 },
  sep: { fontSize: 10, color: 'var(--text-muted)' },
};
