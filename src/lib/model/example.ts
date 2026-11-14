import type { PlainTree } from './types.ts';

/** A small, generic starter tree (not anyone's real data). */
export function exampleTree(): PlainTree {
	const n = (id: string, title: string, meaning: string, children: string[] = [], extra: Partial<PlainTree['nodes'][string]> = {}) => ({
		id, title, meaning, practice: '', avoid: '', notes: {}, rank: [], collapsed: false, children, ...extra
	});
	const nodes = [
		n('ex-love', 'Love', 'We put each other first, especially when it costs us something.', ['ex-kindness', 'ex-forgive', 'ex-hospitality']),
		n('ex-honesty', 'Honesty', 'We tell the truth, including the small, awkward truths.', ['ex-forgive', 'ex-promises']),
		n('ex-curiosity', 'Curiosity', 'We would rather ask a good question than look clever.', ['ex-reading', 'ex-outdoors']),
		n('ex-kindness', 'Kindness', 'Gentle words, especially at home.', [], {
			practice: 'We say thank you at dinner. We check on whoever is having a hard week.'
		}),
		n('ex-forgive', 'Forgiveness', 'We repair things quickly and do not keep score.', [], {
			notes: { 'ex-honesty': 'Name what happened plainly before moving on.' }
		}),
		n('ex-hospitality', 'Hospitality', 'Our table has room for one more.', [], {
			avoid: 'Hosting to impress rather than to welcome.'
		}),
		n('ex-promises', 'Keeping promises', 'If we say we will, we do, or we say so early.'),
		n('ex-reading', 'Reading together', 'Books out loud, at any age.'),
		n('ex-outdoors', 'Time outdoors', 'Weekends start outside when the weather allows.')
	];
	return {
		title: 'Our Family Values',
		intro: 'This is an example. Change anything, or delete it all and start with your own.',
		roots: ['ex-love', 'ex-honesty', 'ex-curiosity'],
		nodes: Object.fromEntries(nodes.map((x) => [x.id, x]))
	};
}

export function blankTree(): PlainTree {
	return { title: 'Our Family Values', intro: '', roots: [], nodes: {} };
}
