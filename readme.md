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

Currently it has only one route and this where all the magic happens

### `/save`

Save the article directly to your obsidian vault

#### Query params

| Name  | Example                       | Required | Description                                                      |
| ----- | ----------------------------- | -------- | ---------------------------------------------------------------- |
| `u`   | `?u=https://example.com/post` | `true`   | The URL for the article to be saved example                      |
| `t`   | `?t[]=tag&t[]=tag2`           | `false`  | Extra tags to add to markdown frontmatter                        |
| `raw` | `?raw=1`                      | `false`  | Returns the markdown result instead of saving it inside Obsidian |

> [!NOTE]
>
> Currently there are some hardcoded defaults, like the folder & a default tag
>
> - folder: `saved-articles`
> - tag: `saved-articles`

## Credits

- @kepano for [the idea](https://stephango.com/obsidian-web-clipper)

## TODO

- [ ] Better logging
- [ ] Better error handling

---

© Ahmed El Gabri
