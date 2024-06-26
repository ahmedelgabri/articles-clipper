import {parseHTML} from 'linkedom/worker'
import {Readability} from '@mozilla/readability'
import slugify from 'slugify'
import {unified} from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import frontmatter from 'remark-frontmatter'
import remarkStringify from 'remark-stringify'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import {visit} from 'unist-util-visit'
import {toHtml} from 'hast-util-to-html'
import mustache from 'mustache'
import type {Link, Image, Root, Parent} from 'mdast'
// @ts-expect-error lack of types
import layout from './template.html'

const defaultTags = ['saved-articles']

const processor = unified().use(rehypeParse, {fragment: true})

export function sendHTML(data: Record<string, any>) {
	return new Response(mustache.render(layout, data), {
		headers: {
			'content-type': 'text/html',
		},
	})
}

export function convertDate(date: Date | ReturnType<typeof Date.now>) {
	{
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Europe/Amsterdam',
		})
			.formatToParts(date)
			.filter((obj) => obj.type !== 'literal')

		console.log(`Converting date from parts: ${parts}`)
		return `${parts[2].value}-${parts[1].value}-${parts[0].value}`
	}
}

type FrontmatterData = {
	title: string
	url: string
	byline: string
	tags: string[]
}

export async function getHtml(url: string) {
	console.log(`fetching HTML from ${url}`)
	const response = await fetch(url, {
		headers: {'content-type': 'text/html;charset=UTF-8'},
	})
	console.log(`returning HTML from ${url}`)
	return response.text()
}

export function addFrontmatter(options: FrontmatterData) {
	function visitor(node: Root) {
		const {title, tags, url, byline} = options

		node.children = [
			{
				type: 'yaml',
				value: `title: "${title}"
author: [${byline}]
category: "[[saved-articles]]"
date: ${convertDate(new Date())}
published:
tags: [${[...defaultTags, ...tags].join(' ')}]
source: "${url}"`,
			},
			...node.children,
		]
	}

	function transform(tree: any) {
		visit(tree, ['root'], visitor)
	}

	return transform
}

export function resolveRelativeURls(options: {base: string}) {
	function visitor(
		node: Link | Image,
		index: number | undefined,
		parent: Parent,
	) {
		if (!('url' in node)) return

		const parsedBaseUrl = new URL(options.base)
		const parsedUrl = new URL(node.url, options.base)

		// Is relative link?
		if (parsedBaseUrl.origin === parsedUrl.origin) {
			// We remove internal links #foo or http://base/#foo
			if (
				node.type === 'link' &&
				parsedUrl.hash &&
				parsedBaseUrl.pathname === parsedUrl.pathname &&
				index != undefined
			) {
				parent.children = [
					...(parent.children || []).slice(0, index),
					...(node.children || []),
					...(parent.children || []).slice(index + 1),
				]
			} else {
				node.url = new URL(node.url, parsedBaseUrl.origin).toString()
			}
		}
	}

	function transform(tree: any) {
		visit(tree, ['link', 'image'], visitor)
	}

	return transform
}

export async function convertToMarkdown(
	content: string,
	fmData: FrontmatterData,
) {
	console.log(
		`Processing HTML to markdown with frontmatter ${JSON.stringify(
			fmData,
			null,
			2,
		)}`,
	)
	const md = await processor()
		.use(rehypeSanitize, {
			// Allow tags/props we want to keep
			...defaultSchema,
			attributes: {
				...defaultSchema.attributes,
				video: ['src', 'controls'],
				audio: ['src', 'controls'],
				iframe: [
					'src',
					'width',
					'height',
					'title',
					'frameborder',
					'allow',
					'allowfullscreen',
				],
			},
			tagNames: [...(defaultSchema.tagNames || []), 'video', 'audio', 'iframe'],
		})
		.use(rehypeRemark, {
			// Handle tags we want to keep raw, mostly media
			handlers: {
				audio(state, node) {
					if (!node.properties.controls) {
						node.properties.controls = true
					}
					const result = {type: 'html', value: toHtml(node)} as const
					state.patch(node, result)
					return result
				},
				video(state, node) {
					if (!node.properties.controls) {
						node.properties.controls = true
					}
					const result = {type: 'html', value: toHtml(node)} as const
					state.patch(node, result)
					return result
				},
				iframe(state, node) {
					const result = {type: 'html', value: toHtml(node)} as const
					state.patch(node, result)
					return result
				},
			},
		})
		.use(resolveRelativeURls, {base: fmData.url})
		.use(remarkGfm)
		.use(addFrontmatter, fmData)
		.use(frontmatter, ['yaml'])
		.use(remarkStringify)
		.process(content)

	console.log(`Returning Markdown`)
	return `${md}`
}

// @TODO: replace this with unified, need to figure out how to get
// title: <title>?
// author: OG author?
// excerpt: <meta description>?
// @FIXME: readability removes `<aside>`, drop it and switch to unified.
export async function parseHtml(html: string) {
	console.log(`parsing HTML`)
	const {document} = parseHTML(html)
	const reader = new Readability(document, {
		keepClasses: true,
	})

	const result = reader.parse()

	console.log(
		`Returning data from Readability ${JSON.stringify(
			{...result, content: 'removed because too big'},
			null,
			2,
		)}`,
	)

	const content =
		result?.content || result?.excerpt || 'Cannot parse content...'
	const byline = result?.byline || ''
	const title = result?.title || 'No title...'

	return {...result, title, content, byline, excerpt: result?.excerpt}
}

export function getFileName(fileName: string) {
	console.log(`Slugify file name: ${fileName}`)
	return `${slugify(fileName, {remove: /[*+~.,()'"!:@\/\\]/g})}.md`
}

export function buildObsidianURL({
	vault = null,
	folder = 'saved-articles/',
	fileName,
	fileContent,
}: {
	vault?: string | null
	folder?: string
	fileName: string
	fileContent: string
}) {
	// @NOTE: Encoding the content can lead to issues like this https://stackoverflow.com/questions/25244361/%C3%A2%E2%82%AC-character-showing-instead-of-em-dash
	let url = `obsidian://new?file=${encodeURIComponent(`${folder}${fileName}`)}`

	url += `&content=${encodeURIComponent(fileContent)}`

	if (vault) {
		url += `&vault=${vault}`
	}

	console.log(`Obsidian URL ${url}`)

	return url
}
