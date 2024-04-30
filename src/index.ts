import {AutoRouter, IRequest} from 'itty-router'
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

type Environment = {AI: any}
type CFArgs = [Environment, ExecutionContext]

const router = AutoRouter<IRequest, CFArgs>()

router.all('/', async (req) => {
	const b = getBookmarklet().replaceAll('__SERVICE_URL__', req.url)

	console.log(`Generating index HTML`)

	return sendHTML({
		data: `<p>Drag the "clip article" bookmarklet to your browser bookmark toolbar<br/><a class="bookmarklet" href="${b}">clip article</a></p>`,
	})
})

router.get('/save', async (req) => {
	console.log(req.query)
	const {u, s, t = [], raw, d} = req.query

	if (typeof u !== 'string' || !u) {
		return new Response('No URL passed', {status: 400})
	}

	if (!Array.isArray(t)) {
		return new Response(`Tags must be an Array`, {status: 400})
	}

	let html = ''

	try {
		html = await getHtml(u)
	} catch (error) {
		console.error(error)
		return new Response(`Failed to get HTML for ${u}`, {status: 500})
	}

	console.log(`Handling HTML for ${u}`)
	const {title, content, byline} = await parseHtml(html)
	const opts = {
		tags: t,
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
		console.log(`Retrun diff for ${u}`)
		return new Response(patch)
	}

	const fileName = getFileName(title)

	const redirectUrl = buildObsidianURL({fileName, fileContent})

	if (raw) {
		console.log(`Retrun raw Markdown for ${u}`)
		return new Response(fileContent)
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
	return Response.redirect(redirectUrl, 301)
})

// 404 for everything else
router.all('*', () => new Response('Not Found.', {status: 404}))

export default {
	...router,
}
