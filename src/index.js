import { validate } from 'schema-utils'
import schema from './options.json'
// import serialize from 'serialize-javascript'

const path = require('path')

const Prerenderer = require('@prerenderer/prerenderer')
const PuppeteerRenderer = require('@prerenderer/renderer-puppeteer')

export default class PrerenderSPAPlugin {
  constructor (options = {}) {
    validate(schema, options, {
      name: 'Prerender SPA Plugin',
      baseDataPath: 'options'
    })

    this.options = options

    this.options.renderer = this.options.renderer || new PuppeteerRenderer(Object.assign({}, { headless: true }, this.options.rendererOptions))
  }

  async prerender (compiler, compilation, assets) {
    console.log(assets)
    // TODO add cache
    // const cache = compilation.getCache('PrerenderSPAPlugin')

    // const cacheItem = cache.getItemCache(
    //   serialize({
    //     name,
    //     options: this.options
    //   }),
    //   cache.getLazyHashedEtag(source)
    // );
    // const output = (await cacheItem.getPromise()) || {};
    const PrerendererInstance = new Prerenderer(this.options)

    try {
      await PrerendererInstance.initialize()
      const renderedRoutes = await PrerendererInstance.renderRoutes(this.options.routes || [])

      // Run postProcess hooks.
      if (typeof this.options.postProcess === 'function') {
        await Promise.all(renderedRoutes.map(renderedRoute => this.options.postProcess(renderedRoute)))
        // Check to ensure postProcess hooks returned the renderedRoute object properly.

        const isValid = renderedRoutes.every(r => typeof r === 'object')
        if (!isValid) {
          throw new Error('[prerender-spa-plugin] Rendered routes are empty, did you forget to return the `context` object in postProcess?')
        }
      }

      // Calculate outputPath if it hasn't been set already.
      renderedRoutes.forEach(rendered => {
        if (!rendered.outputPath) {
          rendered.outputPath = path.join(rendered.route, this.options.indexPath || 'index.html')
        }
      })

      // Create dirs and write prerendered files.
      renderedRoutes.forEach((processedRoute) => {
        compilation.emitAsset(processedRoute.outputPath, processedRoute.html.trim(), { prerendered: true })
      })
    } catch (err) {
      const msg = '[prerender-spa-plugin] Unable to prerender all routes!'
      console.error(msg)
      console.error(err)
      compilation.errors.push(new Error(msg))
      compilation.errors.push(err)
    }

    PrerendererInstance.destroy()
  }

  apply (compiler) {
    const pluginName = this.constructor.name

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: pluginName,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_DERIVED,
          additionalAssets: true
        },
        (assets) => this.prerender(compiler, compilation, assets)
      )
    })
  }
}
