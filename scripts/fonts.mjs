// Тягне woff2 з Google Fonts у static/fonts і пише @font-face у src/lib/styles/_fonts.scss.
// Лише латиниця й кирилиця — решта підмножин гри не потрібна.
import { mkdir, writeFile } from 'node:fs/promises';

const FAMILIES = [
	{ query: 'Tektur:wdth,wght@75..100,400..900', file: 'tektur' },
	{ query: 'Martian+Mono:wdth,wght@75..112.5,100..800', file: 'martian-mono' }
];
const SUBSETS = ['latin', 'cyrillic'];
// Сучасний UA, інакше Google віддасть ttf замість woff2.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

await mkdir('static/fonts', { recursive: true });
let scss = '// Згенеровано scripts/fonts.mjs — не редагувати руками.\n';

for (const { query, file } of FAMILIES) {
	const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, { headers: { 'user-agent': UA } })).text();
	for (const [, subset, body] of css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]+)\}/g)) {
		if (!SUBSETS.includes(subset)) continue;
		const url = body.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
		if (!url) throw new Error(`немає woff2 для ${file}/${subset}`);
		const name = `${file}-${subset}.woff2`;
		await writeFile(`static/fonts/${name}`, Buffer.from(await (await fetch(url)).arrayBuffer()));
		scss += `@font-face {${body.replace(url, `/fonts/${name}`)}}\n`;
		console.log('ok', name);
	}
}

await mkdir('src/lib/styles', { recursive: true });
await writeFile('src/lib/styles/_fonts.scss', scss);
