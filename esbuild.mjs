import fs from 'node:fs'
import path from 'node:path'
import * as esbuild from 'esbuild'

const ctx = await esbuild.build({
	stdin: {
		contents: `function getSelectedHtml() {
		const selection = window.getSelection();
		if (selection.rangeCount) {
			const range = selection.getRangeAt(0);
			const clonedSelection = range.cloneContents();
			const div = document.createElement('div');
			div.appendChild(clonedSelection);
			return div.innerHTML;
		}
	}

	const selectionHTML = getSelectedHtml();
	let url = "__SERVICE_URL__save?u=" + encodeURIComponent(document.location);

	if (selectionHTML) {
		url += '&s=' + encodeURIComponent(selectionHTML);
	}

	document.location.href = url;`,
		loader: 'js',
	},
	bundle: true,
	minify: true,
	outfile: path.resolve('./src/bookmarklet.ts'),
	write: false,
	format: 'iife',
	plugins: [
		// Original code copied from https://github.com/reesericci/esbuild-plugin-bookmarklet
		{
			name: 'bookmarklet',
			setup(build) {
				const options = build.initialOptions
				if (options.write == true) {
					throw new Error(
						'`write` must be set to false for this plugin to work correctly.',
					)
				}
				if (options.format != 'iife') {
					throw new Error(
						'`format` must be set to iife for this plugin to work correctly.',
					)
				}
				if (options.minify != true) {
					throw new Error(
						'`minify` must be set to true for your bookmarklet to work as expected.',
					)
				}
				build.onEnd(async (result) => {
					if (result.outputFiles == null) {
						throw new Error(
							'Unable to access outputFiles. This is likely due to `write` being set to true.',
						)
					}
					const encoder = new TextEncoder()
					const js = result.outputFiles.find((f) => f.path.match(/\.ts$/))
					const modified =
						`// DON'T MODIFY THIS FILE BY HAND. THIS IS A GENERATED FILE.
export default function getBookmarklet() { return '` +
						encodeURI('javascript:void ' + js.text) +
						"' }"
					js.contents = encoder.encode(modified)
					fs.writeFileSync(js.path, js.text, 'utf-8')
				})

				build.onDispose(() => {
					process.exit(0)
				})
			},
		},
	],
})
