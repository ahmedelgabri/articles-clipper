import { Hono } from 'hono'
import * as diff from 'diff'
import {
	buildObsidianURL,
	convertToMarkdown,
	getFileName,
	getHtml,
	parseHtml,
	sendHTML,
} from './shared'
import getBookmarklet from './bookmarklet'

type Environment = { AI: any }

const app = new Hono<{ Bindings: Environment }>()

app.get('/', async (c) => {
	const b = getBookmarklet().replaceAll('__SERVICE_URL__', c.req.url)

	console.log(`Generating index HTML`)

	return sendHTML({
		data: `<p>Drag the "clip article" bookmarklet to your browser bookmark toolbar<br/><a class="bookmarklet" href="${b}">clip article</a></p>`,
	})
})

app.get('/save', async (c) => {
	console.log(c.req.query())
	const u = c.req.query('u')
	const s = c.req.query('s')
	const t = c.req.query('t')
	const raw = c.req.query('raw')
	const d = c.req.query('d')

	if (typeof u !== 'string' || !u) {
		return c.text('No URL passed', 400)
	}

	const tags = t ? t.split(',').map(tag => tag.trim()) : []

	let html = ''

	try {
		html = await getHtml(u)
	} catch (error) {
		console.error(error)
		return c.text(`Failed to get HTML for ${u}`, 500)
	}

	console.log(`Handling HTML for ${u}`)
	const { title, content, byline } = await parseHtml(html)
	const opts = {
		tags,
		url: u,
		byline,
		title,
	}
	const fileContent = await convertToMarkdown(
		typeof s === 'string' ? s : content,
		opts,
	)

	if (d) {
		const unifiedFileContent = await convertToMarkdown(
			typeof s === 'string' ? s : html,
			opts,
		)

		const patch = diff.createTwoFilesPatch(
			'Readability',
			'Unified',
			fileContent,
			unifiedFileContent,
		)
		console.log(`Return diff for ${u}`)
		return c.text(patch)
	}

	const fileName = getFileName(title)

	const redirectUrl = buildObsidianURL({ fileName, fileContent })

	if (raw) {
		console.log(`Return raw Markdown for ${u}`)
		return c.text(fileContent)
	}

	const contentSize = new Blob([fileContent]).size
	const urlSize = new Blob([redirectUrl]).size

	console.log(`Content size: ${contentSize} bytes`)
	console.log(`URL size: ${urlSize} bytes`)

	if (urlSize > 20000) {
		return sendHTML({
			data: `<p>Article is too big, can't automatically add it to your vault. Click this link instead<br /><a href="${redirectUrl}">Add to vault</a></p>`,
		})
	}

	console.log(`Redirect for Obsidian for ${u}`)
	return c.redirect(redirectUrl, 301)
})

app.notFound((c) => c.text('Not Found.', 404))

export default app
