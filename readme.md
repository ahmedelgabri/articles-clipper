> [!NOTE]
>
> Use [Obsidian Web Clipper](https://obsidian.md/clipper) instead


---



# Articles clipper

A small Cloudflare worker service, to save articles as Markdown or save them
directly inside my Obsidian vault.

## Local development

Development uses
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) so make sure
you are authenticated properly, then run

```shell
pnpm dev
```

## Testing

Testing is using [`vitest`](https://vitest.dev) you can run tests running the
following command, locally it will watch and on CI it will run the tests and
exit.

```shell
pnpm test
```

> ##### TODO
>
> - [ ] add e2e testing using
>       [`miniflare`](https://github.com/cloudflare/workers-sdk/tree/main/packages/miniflare)

## Deploying

### CI

The repo already automatically deploys the app after every successful build on
`main` using the official
[`wrangler-action`](https://github.com/cloudflare/wrangler-action), a
`CLOUDFLARE_API_TOKEN` variable is required for this.

### Manually

If needed you can also deploy manually. But the deploy command uses
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) so make sure
you are authenticated properly, then run

```shell
pnpm deploy
```

`wrangler` will handle bundling and building for you before it deploy it.

## How it works?

### `/`

When you land on the root route you will see a bookmarklet that you can save in
your browser to be able to quickly save an article. The bookmarklet should work
also in mobile browsers.

### `/save`

Save the article directly to your obsidian vault

#### Query params

| Name  | Example                       | Required | Description                                                                 |
| ----- | ----------------------------- | -------- | --------------------------------------------------------------------------- |
| `u`   | `?u=https://example.com/post` | `true`   | The URL for the article to be saved example                                 |
| `s`   | `?s=<h1>test</h1>`            | `false`  | A string to be converted, HTML or just plain string                         |
| `t`   | `?t[]=tag&t[]=tag2`           | `false`  | Extra tags to add to markdown frontmatter                                   |
| `raw` | `?raw=1`                      | `false`  | Returns the markdown result instead of saving it inside Obsidian            |
| `d`   | `?d=1`                        | `false`  | Returns the markdown diff result between readability and unified (unstable) |

> [!IMPORTANT]
>
> Some articles can be huge, and these can't be automatically downloaded because
> the header size will be too large and can cause issues ranging from hanging
> the request to throwing `500` or `502` errors, depending on the platform you
> are hosting your application on.
>
> So right now there is an arbitrary limit (`20000` bytes) if the content
> exceeds this it will redirect to an HTML page with an `<a>`, that when clicked
> will add the note to the vault.
>
> I decided this was a good trade-off instead of triggering a download because a
> download will still require manual work, while the `<a>` tag will add to
> Obsidian directly.

> [!NOTE]
>
> Currently there are some hardcoded defaults, like the folder & a default tag
>
> - folder: `saved-articles`
> - tag: `saved-articles`

## Credits

- @kepano for [the idea](https://stephango.com/obsidian-web-clipper)

## TODO

- [x] Handle embeds and media (partially done)
      https://help.obsidian.md/Linking+notes+and+files/Embedding+files &
      https://help.obsidian.md/Editing+and+formatting/Embedding+web+pages
- [ ] Handle `<mark>` tags -> `==highlight==`
- [ ] Handle `<s>` tags -> `~~strikethrough~~ `
- [ ] prepend `[!quote]` to blockquotes
      https://help.obsidian.md/Editing+and+formatting/Callouts#Supported+types
- [ ] Handle `<kbd>` tags?
- [ ] Better logging
- [ ] Better error handling

---

© Ahmed El Gabri
