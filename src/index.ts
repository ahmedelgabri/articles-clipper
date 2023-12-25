import {Router} from 'itty-router'
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

const router = Router()
const defaultTags = ['saved-articles']

/////////////////////////////////////////////////////////////////////////////////
// Functions
/////////////////////////////////////////////////////////////////////////////////

const processor = unified().use(rehypeParse, {fragment: true})

export function convertDate(date: Date | ReturnType<typeof Date.now>) {
	{
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'Europe/Amsterdam',
		})
			.formatToParts(date)
			.filter((obj) => obj.type !== 'literal')

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
	const response = await fetch(url, {
		headers: {'content-type': 'text/html;charset=UTF-8'},
	})
	return response.text()
}

export function addFrontmatter(options: FrontmatterData) {
	function visitor(node: Record<string, any>) {
		const {title, tags, url, byline} = options

		node.children = [
			{
				type: 'yaml',
				value: `title: "${title}"
author: "${byline}"
category: "[[saved-articles]]"
date: ${convertDate(new Date())}
published: ????
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
	function visitor(
		node: Record<string, any>,
		index: number | undefined,
		parent: Record<string, any>,
	) {
		if (node.url.startsWith('./') || node.url.startsWith('/')) {
			node.url = new URL(node.url, new URL(options.base).origin).toString()
		}

		if (node.url.startsWith('#')) {
			// Remove internal headings links
			if (parent.type === 'heading' && index != undefined) {
				parent.children.splice(index, 1)
			}
		}
	}

	function transform(tree: Node) {
		visit(tree, ['link', 'linkReference', 'image'], visitor)
	}

	return transform
}

export async function convertToMarkdown(
	content: string,
	fmData: FrontmatterData,
) {
	// @TODO: handle media??
	const md = await processor()
		.use(rehypeSanitize)
		.use(rehypeRemark)
		.use(resolveRelativeURls, {base: fmData.url})
		.use(remarkGfm)
		.use(addFrontmatter, fmData)
		.use(frontmatter, ['yaml'])
		.use(remarkStringify)
		.process(content)

	return `${md}`
}

// @TODO: replace this with unified, need to figure out how to get
// title: <title>?
// author: OG author?
// excerpt: <meta description>?
export async function parseHtml(html: string) {
	const {document} = parseHTML(html)
	const reader = new Readability(document, {
		keepClasses: true,
	})

	const result = reader.parse()

	const content =
		result?.content || result?.excerpt || 'Cannot parse content...'
	const byline = result?.byline || ''
	const title = result?.title || 'No title...'

	return {...result, title, content, byline, excerpt: result?.excerpt}
}

export function getFileName(fileName: string) {
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

	return url
}

/////////////////////////////////////////////////////////////////////////////////
// ROUTES
/////////////////////////////////////////////////////////////////////////////////

router.all('/', (req) => {
	// remove the / from the end of the URL
	const serviceUrl = req.url.slice(0, -1)
	const html = `Save the "clip article" bookmarklet to your browser <a href="javascript:(function()%7Bdocument.location.href%3D%60https%3A%2F%2F${serviceUrl}%2Fsave%3Fu%3D%24%7BencodeURIComponent(document.location)%7D%60%3B%7D)()">clip article</a>`

	return new Response(html, {
		headers: {
			'content-type': 'text/html',
		},
	})
})

router.get('/save', async (req) => {
	console.log(req.query)
	const {u, t = [], raw} = req.query

	if (typeof u !== 'string' || !u) {
		return new Response('No URL passed', {status: 500})
	}

	if (!Array.isArray(t)) {
		return new Response(`Tags must be an Array`, {status: 500})
	}

	let html = ''

	try {
		html = await getHtml(u)
	} catch (error) {
		return new Response(`Failed to get HTML for ${u}`, {status: 500})
	}

	const {title, content, byline} = await parseHtml(html)
	const fileContent = await convertToMarkdown(content, {
		tags: t,
		url: u,
		byline,
		title,
	})
	const fileName = getFileName(title)

	const redirectUrl = buildObsidianURL({fileName, fileContent})

	if (raw) {
		return new Response(fileContent)
	}

	return Response.redirect(redirectUrl, 301)
})

// 404 for everything else
router.all('*', () => new Response('Not Found.', {status: 404}))

export default {
	fetch: router.handle,
}
