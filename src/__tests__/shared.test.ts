import fs from 'node:fs'
import path from 'node:path'
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vitest'
import {setupServer} from 'msw/node'
import {HttpResponse, http} from 'msw'
import {
	buildObsidianURL,
	convertDate,
	getFileName,
	getHtml,
	parseHtml,
	convertToMarkdown,
	resolveRelativeURls,
	removeInternalLinks,
	addFrontmatter,
} from '../shared'

const html = fs.readFileSync(path.resolve(__dirname, './test.html'), 'utf8')

describe('tests', () => {
	beforeAll(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2023-12-23'))
	})

	afterAll(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	describe('buildObsidianURL', () => {
		const defaultFolder = 'saved-articles/'
		const defaultFileName = 'foo'
		const defaultFileContent = '# Hello'

		test.each([
			[
				{
					folder: defaultFolder,
					fileName: defaultFileName,
					fileContent: defaultFileContent,
				},
				'obsidian://new?file=saved-articles%2Ffoo&content=%23%20Hello',
			],
			[
				{
					folder: 'folder/',
					fileName: defaultFileName,
					fileContent: defaultFileContent,
				},
				'obsidian://new?file=folder%2Ffoo&content=%23%20Hello',
			],
			[
				{
					vault: 'my-vault',
					fileName: defaultFileName,
					fileContent: defaultFileContent,
				},
				'obsidian://new?file=saved-articles%2Ffoo&content=%23%20Hello&vault=my-vault',
			],
			[
				{
					folder: 'new-folder/',
					vault: 'my-vault2',
					fileName: defaultFileName,
					fileContent: defaultFileContent,
				},
				'obsidian://new?file=new-folder%2Ffoo&content=%23%20Hello&vault=my-vault2',
			],
		])(
			'Return correct URL for: %o',
			// @ts-ignore
			({folder = defaultFolder, fileContent, fileName, vault}, output) => {
				expect(buildObsidianURL({fileName, fileContent, folder, vault})).toBe(
					output,
				)
			},
		)
	})

	describe.skip('convertDate', () => {
		test.each([
			[new Date(), '2023-12-23'],
			[Date.now(), '2023-12-23'],
		])('Format Date correctly for: %o', (date, expected) => {
			expect(convertDate(date)).toBe(expected)
		})
	})

	describe('getFileName', () => {
		test.each([
			['some_%@#-title-name', 'some_percent#-title-name.md'],
			['some_+~*,.()!:@#-title-name', 'some_#-title-name.md'],
		])(
			'Slufigy the title removing invalid characters for: %s',
			(title, expected) => {
				expect(getFileName(title)).toBe(expected)
			},
		)
	})

	describe('unified.js plugins', () => {
		let astTree = {type: 'root', children: [{}]}

		beforeEach(() => {
			astTree = {
				type: 'root',
				children: [
					{type: 'text', value: 'Some text'},
					{type: 'link', url: '/foo'},
					{type: 'link', url: 'https://example.com/foo'},
					{type: 'link', url: '../../path/foo'},
					{type: 'linkReference', url: './bar/baz'},
					{type: 'linkReference', url: 'https://example.com/bar/baz'},
					{
						type: 'heading',
						children: [
							{
								type: 'linkReference',
								url: '#some-href',
								children: [],
							},
						],
					},
					{type: 'linkReference', url: 'https://example.com#some-other-href'},
					{type: 'image', url: '/foo.svg'},
					{type: 'image', url: 'https://example.com/foo.svg'},
					{type: 'imageReference', url: '/foo.svg'},
				],
			}
		})
		describe('addFrontmatter', () => {
			test('Add frontmatter to the Mdast AST', () => {
				const options = {
					title: 'My title',
					url: 'https://example.com',
					byline: 'John Doe',
					tags: ['a', 'b'],
				}
				addFrontmatter(options)(astTree)
				expect(astTree).toMatchObject({
					type: 'root',
					children: [
						{
							type: 'yaml',
							value: `title: "My title"
author: [John Doe]
category: "[[saved-articles]]"
date: 2023-12-23
published:
tags: [saved-articles a b]
source: "https://example.com"`,
						},
						{type: 'text', value: 'Some text'},
						{
							type: 'link',
							url: '/foo',
						},
						{
							type: 'link',
							url: 'https://example.com/foo',
						},
						{
							type: 'link',
							url: '../../path/foo',
						},
						{
							type: 'linkReference',
							url: './bar/baz',
						},
						{
							type: 'linkReference',
							url: 'https://example.com/bar/baz',
						},
						{
							type: 'heading',
							children: [
								{
									type: 'linkReference',
									url: '#some-href',
								},
							],
						},
						{
							type: 'linkReference',
							url: 'https://example.com#some-other-href',
						},
						{
							type: 'image',
							url: '/foo.svg',
						},
						{
							type: 'image',
							url: 'https://example.com/foo.svg',
						},
						{
							type: 'imageReference',
							url: '/foo.svg',
						},
					],
				})
			})
		})

		describe('resolveRelativeURls', () => {
			test('Resolve relative URLs', () => {
				const options = {base: 'https://foo.com'}
				resolveRelativeURls(options)(astTree)
				expect(astTree).toMatchObject({
					type: 'root',
					children: [
						{type: 'text', value: 'Some text'},
						{
							type: 'link',
							url: 'https://foo.com/foo',
						},
						{
							type: 'link',
							url: 'https://example.com/foo',
						},
						{
							type: 'link',
							url: 'https://foo.com/path/foo',
						},
						{
							type: 'linkReference',
							url: 'https://foo.com/bar/baz',
						},
						{
							type: 'linkReference',
							url: 'https://example.com/bar/baz',
						},
						{
							type: 'heading',
							children: [{type: 'linkReference', url: '#some-href'}],
						},
						{
							type: 'linkReference',
							url: 'https://example.com#some-other-href',
						},
						{
							type: 'image',
							url: 'https://foo.com/foo.svg',
						},
						{
							type: 'image',
							url: 'https://example.com/foo.svg',
						},
						{
							type: 'imageReference',
							url: 'https://foo.com/foo.svg',
						},
					],
				})
			})
		})

		describe('removeInternalLinks', () => {
			test('Remove internal links', () => {
				removeInternalLinks()(astTree)
				expect(astTree).toMatchObject({
					type: 'root',
					children: [
						{type: 'text', value: 'Some text'},
						{
							type: 'link',
							url: '/foo',
						},
						{
							type: 'link',
							url: 'https://example.com/foo',
						},
						{
							type: 'link',
							url: '../../path/foo',
						},
						{
							type: 'linkReference',
							url: './bar/baz',
						},
						{
							type: 'linkReference',
							url: 'https://example.com/bar/baz',
						},
						{
							type: 'heading',
							children: [],
						},
						{
							type: 'linkReference',
							url: 'https://example.com#some-other-href',
						},
						{
							type: 'image',
							url: '/foo.svg',
						},
						{
							type: 'image',
							url: 'https://example.com/foo.svg',
						},
						{
							type: 'imageReference',
							url: '/foo.svg',
						},
					],
				})
			})
		})
	})

	describe('getHtml', () => {
		const url = 'https://example.com/post'
		const server = setupServer(
			http.get(url, () => {
				return new HttpResponse(html, {
					headers: {'content-type': 'text/html'},
				})
			}),
		)

		// Start server before all tests
		beforeAll(() => server.listen({onUnhandledRequest: 'error'}))

		//  Close server after all tests
		afterAll(() => server.close())

		// Reset handlers after each test `important for test isolation`
		afterEach(() => server.resetHandlers())

		test('Returns the correct HTML for the URL', async () => {
			await expect(getHtml(url)).resolves.toEqual(html)
		})
	})

	describe('parseHtml', () => {
		test.each([
			{
				name: 'test.html',
				input: html,
				output: {
					title: 'RTL on the web, web related tools & maybe more...',
					byline: 'Ahmed El Gabri',
					dir: null,
					lang: 'en',
					length: 267,
					excerpt: 'On\n\t\t\t\t2018-03-28',
					siteName: null,
					publishedTime: null,
					content:
						'<DIV class="page" id="readability-page-1"><div class="mx-auto py-12 lg:w-my">\n' +
						'\t\t\t<div class="mb-12 flex items-center justify-between">\n' +
						'\t\t\t\t<P>\n' +
						'\t\t\t\t\t<a class="block p-3" href="/"><h2 class="text-sm leading-none">Ahmed El Gabri</h2></a>\n' +
						'\t\t\t\t</P>\n' +
						'\t\t\t\t\n' +
						'\t\t\t</div>\n' +
						'\t\t\t\n' +
						'\t\t\t<p><time class="mb-12 block font-mono text-sm italic text-gray-500" datetime="2018-03-28T00:00:00.000Z">On\n' +
						'\t\t\t\t<!-- -->2018-03-28</time></p><p>\n' +
						'\t\t\t\t\tLast month\n' +
						'\t\t\t\t\t<a target="_blank" rel="noopener noreferrer" href="https://twitter.com/necolas">@necolas</a>\n' +
						'\t\t\t\t\ttweeted a thread about localization &amp; RTL support in web apps.\n' +
						"\t\t\t\t\tIt's a very nice thread, you should check it!\n" +
						'\t\t\t\t</p>\n' +
						'\t\t\t<p class="py-12 text-sm text-gray-300 dark:text-gray-500">\n' +
						'\t\t\t\t©\n' +
						'\t\t\t\t<!-- -->2023<!-- -->\n' +
						'\t\t\t\t<!-- -->Ahmed El Gabri\n' +
						'\t\t\t</p>\n' +
						'\t\t</div></DIV>',
					textContent:
						'\n' +
						'\t\t\t\n' +
						'\t\t\t\t\n' +
						'\t\t\t\t\tAhmed El Gabri\n' +
						'\t\t\t\t\n' +
						'\t\t\t\t\n' +
						'\t\t\t\n' +
						'\t\t\t\n' +
						'\t\t\tOn\n' +
						'\t\t\t\t2018-03-28\n' +
						'\t\t\t\t\tLast month\n' +
						'\t\t\t\t\t@necolas\n' +
						'\t\t\t\t\ttweeted a thread about localization & RTL support in web apps.\n' +
						"\t\t\t\t\tIt's a very nice thread, you should check it!\n" +
						'\t\t\t\t\n' +
						'\t\t\t\n' +
						'\t\t\t\t©\n' +
						'\t\t\t\t2023\n' +
						'\t\t\t\tAhmed El Gabri\n' +
						'\t\t\t\n' +
						'\t\t',
				},
			},
			{
				input: `<html><body><h1>Hello</body></html>`,
				name: 'malformed html',
				output: {
					byline: '',
					content:
						'<DIV class="page" id="readability-page-1"><h2>Hello</h2></DIV>',
					dir: null,
					excerpt: undefined,
					lang: null,
					length: 5,
					publishedTime: null,
					siteName: null,
					textContent: 'Hello',
					title: 'No title...',
				},
			},
		])('Returns metadata from HTML for $name', async ({input, output}) => {
			await expect(parseHtml(input)).resolves.toMatchObject(output)
		})
	})

	describe('convertToMarkdown', () => {
		test('Convert HTML to Markdown with frontmatter', async () => {
			await expect(
				convertToMarkdown(html, {
					title: 'My Post',
					url: 'https://example.com/post',
					tags: [],
					byline: 'Hamada Batekha',
				}),
			).resolves.toBe(`---
title: "My Post"
author: [Hamada Batekha]
category: "[[saved-articles]]"
date: 2023-12-23
published:
tags: [saved-articles]
source: "https://example.com/post"
---

Ahmed El Gabri | Software Engineer - RTL on the web, web related tools & maybe more...

# [Ahmed El Gabri](https://example.com/)

## RTL on the web, web related tools & maybe more...

On 2018-03-28

Last month [@necolas](https://twitter.com/necolas) tweeted a thread about localization & RTL support in web apps. It's a very nice thread, you should check it!

© 2023 Ahmed El Gabri
`)
		})
	})
})
