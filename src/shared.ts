import {unified} from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import frontmatter from 'remark-frontmatter'
import remarkStringify from 'remark-stringify'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import {visit} from 'unist-util-visit'
import {toHtml} from 'hast-util-to-html'
import {toString} from 'hast-util-to-string'
import {select} from 'hast-util-select'
import type {Link, Image, Root, Parent} from 'mdast'
import slugify from 'slugify'
// @ts-expect-error lack of types
import layout from './template.html'

const defaultTags = ['saved-articles']

export function sendHTML() {
	return new Response(layout, {
		headers: {
			'content-type': 'text/html',
		},
	})
}

export function convertDate(date: Date | ReturnType<typeof Date.now>) {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Amsterdam',
	})
		.formatToParts(date)
		.filter((obj) => obj.type !== 'literal')

	console.log(`Converting date from parts: ${parts}`)
	return `${parts[2].value}-${parts[1].value}-${parts[0].value}`
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

export async function parseHtml(html: string, url: string) {
	console.log(`parsing HTML`)

	const processor = unified()
		.use(rehypeParse)
		.use(rehypeSanitize, {
			...defaultSchema,
			attributes: {
				...defaultSchema.attributes,
				'*': ['className'],
			},
		})

	const tree = processor.parse(html)
	const titleNode = select('title', tree)
	const title = titleNode ? toString(titleNode) : 'No title...'

	const bylineNode = select('meta[name="author"]', tree)
	const byline = bylineNode?.properties?.content || ''

	const excerptNode = select('meta[name="description"]', tree)
	const excerpt = excerptNode?.properties?.content || ''

	const contentNode = select('body', tree)
	const content = contentNode ? toHtml(contentNode) : 'Cannot parse content...'

	console.log(`Parsed HTML for ${url}`)

	return {title, content, byline, excerpt}
}

export async function convertToMarkdown(
	content: string,
	fmData: FrontmatterData,
) {
	console.log(
		`Processing HTML to markdown with frontmatter ${JSON.stringify(fmData, null, 2)}`,
	)

	const md = await unified()
		.use(rehypeParse)
		.use(rehypeRemark)
		.use(remarkGfm)
		.use(resolveRelativeURls, {base: fmData.url})
		.use(addFrontmatter, fmData)
		.use(frontmatter, ['yaml'])
		.use(remarkStringify)
		.process(content)

	console.log(`Returning Markdown`)
	return String(md)
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
	let url = `obsidian://new?file=${encodeURIComponent(`${folder}${fileName}`)}`
	url += `&content=${encodeURIComponent(fileContent)}`
	if (vault) {
		url += `&vault=${vault}`
	}
	console.log(`Obsidian URL ${url}`)
	return url
}
