/** A simple in-memory token bucket per key (client IP). */
export function tokenBucket(opts: { capacity: number; refillPerMinute: number }) {
	const buckets = new Map<string, { tokens: number; at: number }>();
	const rate = opts.refillPerMinute / 60_000;
	return {
		take(key: string, now = Date.now()): boolean {
			let b = buckets.get(key);
			if (!b) {
				b = { tokens: opts.capacity, at: now };
				buckets.set(key, b);
			}
			b.tokens = Math.min(opts.capacity, b.tokens + (now - b.at) * rate);
			b.at = now;
			if (buckets.size > 10_000) {
				for (const [k, x] of buckets) if (x.tokens >= opts.capacity) buckets.delete(k);
			}
			if (b.tokens < 1) return false;
			b.tokens -= 1;
			return true;
		}
	};
}
