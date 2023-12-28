import {parseHTML} from 'linkedom/worker'
import {Readability} from '@mozilla/readability'
import slugify from 'slugify'
import {unified} from 'unified'
import {type Node} from 'unified/lib'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import remarkGfm from 'remark-gfm'
import frontmatter from 'remark-frontmatter'
import remarkStringify from 'remark-stringify'
import rehypeSanitize from 'rehype-sanitize'
import {visit} from 'unist-util-visit'
import mustache from 'mustache'
// @ts-expect-error lack of types
import layout from './template.html'

const defaultTags = ['saved-articles']

/////////////////////////////////////////////////////////////////////////////////
// Functions
/////////////////////////////////////////////////////////////////////////////////

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
	function visitor(node: Record<string, any>) {
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

	function transform(tree: Node) {
		visit(tree, ['root'], visitor)
	}

	return transform
}

export function resolveRelativeURls(options: {base: string}) {
	function visitor(node: Record<string, any>) {
		if (node.url.startsWith('.') || node.url.startsWith('/')) {
			node.url = new URL(node.url, new URL(options.base).origin).toString()
		}
	}

	function transform(tree: Node) {
		visit(tree, ['link', 'linkReference', 'image', 'imageReference'], visitor)
	}

	return transform
}

export function removeInternalLinks() {
	function visitor(
		node: Record<string, any>,
		index: number | undefined,
		parent: Record<string, any>,
	) {
		if (node.url.startsWith('#') && index != undefined) {
			parent.children = [
				...(parent.children || []).slice(0, index),
				...(node.children || []),
				...(parent.children || []).slice(index + 1),
			]
		}
	}

	function transform(tree: Node) {
		visit(tree, ['link', 'linkReference'], visitor)
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
	// @TODO: handle media??
	const md = await processor()
		.use(rehypeSanitize)
		.use(rehypeRemark)
		.use(resolveRelativeURls, {base: fmData.url})
		.use(removeInternalLinks)
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
export async function parseHtml(html: string) {
	console.log(`parsing HTML`)
	const {document} = parseHTML(html)
	const reader = new Readability(document, {
		keepClasses: true,
	})

	const result = reader.parse()

	console.log(
		`Returning data from Readability ${JSON.stringify(result, null, 2)}`,
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
	let url = `obsidian://new?file=${encodeURIComponent(
		`${folder}${fileName}`,
	)}&content=${encodeURIComponent(fileContent)}`

	if (vault) {
		url += `&vault=${vault}`
	}

	console.log(`Obsidian URL ${url}`)

	return url
}
