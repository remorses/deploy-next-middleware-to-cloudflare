import { cac } from 'cac'
import { buildMiddleware } from './build'
const { name, version } = require('../package.json')

const cli = cac(name)

cli.command('')
    .option('--url <url>', 'Your deployed Next.js url, like xxx.fly.dev', {})
    .option(
        '--use-secrets',
        'process.env.VAR is converted to use Cloudflare secrets',
        { default: false },
    )
    .option('--middleware <middlewarePath>', 'Your Next.js middleware path', {})
    .action(async (opts) => {
        // console.log(opts)
        const { middleware, url, useSecrets } = opts
        await buildMiddleware({
            middleware,
            url,
            useSecrets,
        })
    })

cli.help()
cli.version(version)

async function main() {
    try {
        // Parse CLI args without running the command
        cli.parse(process.argv, { run: false })
        // Run the command yourself
        // You only need `await` when your command action returns a Promise
        await cli.runMatchedCommand()
    } catch (error: any) {
        // Handle error here..
        // e.g.
        console.error(error.stack)
        process.exit(1)
    }
}

main()

let finalUrl =
    process.env.NEXT_PUBLIC_ENV === 'development'
        ? `http://localhost:5467`
        : process.env.NEXT_PUBLIC_ENV === 'preview'
        ? 'https://knowledg-website-preview.fly.dev'
        : ``