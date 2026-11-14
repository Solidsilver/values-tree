export type Theme = 'light' | 'dark' | 'system';

class ThemeState {
	value = $state<Theme>('system');
	private systemDark = $state(false);
	private watching = false;
	init() {
		if (!this.watching && typeof matchMedia !== 'undefined') {
			this.watching = true;
			const mq = matchMedia('(prefers-color-scheme: dark)');
			this.systemDark = mq.matches;
			mq.addEventListener('change', (e) => (this.systemDark = e.matches));
		}
		try {
			const t = localStorage.getItem('vt:theme');
			this.value = t === 'light' || t === 'dark' ? t : 'system';
		} catch {}
	}
	/** The theme actually showing right now. */
	get effective(): 'light' | 'dark' {
		if (this.value !== 'system') return this.value;
		return this.systemDark ? 'dark' : 'light';
	}
	toggle() {
		this.set(this.effective === 'dark' ? 'light' : 'dark');
	}
	set(t: Theme) {
		this.value = t;
		try {
			if (t === 'system') localStorage.removeItem('vt:theme');
			else localStorage.setItem('vt:theme', t);
		} catch {}
		if (t === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = t;
	}
}
export const theme = new ThemeState();
