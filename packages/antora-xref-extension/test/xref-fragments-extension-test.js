/* eslint-env mocha */
/* eslint no-template-curly-in-string: "off" */
'use strict'

const { expect, heredoc } = require('@springio/antora-xref-test-harness')
const logger = require('@antora/logger')
const { loadAsciiDoc, resolveAsciiDocConfig } = require('@antora/asciidoc-loader')
const { convertDocuments } = require('@antora/document-converter')
const ContentCatalog = require('@antora/content-classifier/content-catalog')

describe('xref extension', () => {
  describe('bootstrap', () => {
    it('should be able to require extension', () => {
      const exports = require('@springio/antora-xref-extension')
      expect(exports).to.be.instanceOf(Object)
      expect(exports.register).to.be.instanceOf(Function)
    })
  })

  describe('integration', () => {
    const ext = require('@springio/antora-xref-extension')

    let generatorContext
    let contentCatalog

    const loggerDestination = new (class extends require('events') {
      write (message) {
        this.messages.push(message)
        return message.length
      }
    })()

    beforeEach(async () => {
      loggerDestination.messages = []
      logger.configureLogger({ level: 'all', destination: loggerDestination })
      generatorContext = createGeneratorContext()
      contentCatalog = new ContentCatalog()
      contentCatalog.registerComponentVersion('test', '1.0', { title: 'test' })
    })

    it('should allow link without fragment', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc" class="xref page">Target</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow link without fragment and text', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should not stop antora error on missing link', () => {
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:missing.adoc#missing[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#missing.adoc#missing" class="xref unresolved">here</a>')
      expect(
        loggerDestination.messages.some(
          (message) =>
            message.includes('"level":"error"') && message.includes('target of xref not found: missing.adoc#missing')
        )
      ).to.be.true()
    })

    it('should warn on missing fragment', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#missing[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#missing" class="xref page">here</a>')
      expect(
        loggerDestination.messages.some(
          (message) =>
            message.includes('"level":"error"') &&
            message.includes('target fragement of xref not found: target.adoc#missing')
        )
      ).to.be.true()
    })

    it('should not warn on matching fragment', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should use fragment title if no text', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should replace all links in the line', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment

      [[other]]
      == Other
      Other Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[] and xref:target.adoc#other[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(page.contents.toString()).to.include('<a href="target.adoc#other" class="xref page">Other</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should use fragment reftext if no text', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag,Linked]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Linked</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow self xref', () => {
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      [[frag]]
      == Fragment
      The Fragment

      == Other
      Go read xref:xref.adoc#frag[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#frag">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow loop xref', () => {
      addFile(
        'xref1.adoc',
        heredoc`
      = Xref1

      [[frag]]
      == Fragment
      The Fragment

      == Other
      Go read xref:xref2.adoc#frag[here]
      `
      )
      addFile(
        'xref2.adoc',
        heredoc`
      = Xref2

      [[frag]]
      == Fragment
      The Fragment

      == Other
      Go read xref:xref1.adoc#frag[here]
      `
      )
      run()
      const page1 = contentCatalog.getPages((candidate) => candidate.path === '/xref1.adoc')[0]
      const page2 = contentCatalog.getPages((candidate) => candidate.path === '/xref2.adoc')[0]
      expect(page1.contents.toString()).to.include('<a href="xref2.adoc#frag"')
      expect(page2.contents.toString()).to.include('<a href="xref1.adoc#frag"')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow reference to table', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      == Fragment
      The Fragment

      |===
      | one
      | two

      | [[three]]three
      | four
      |===

      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#three[here]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#three" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow reference in table', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      |===
      | one
      | two

      | xref:target.adoc#frag[]
      | four
      |===
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow reference in list', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      * one
      * two
      * xref:target.adoc#frag[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow reference in admon', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      NOTE: Go read xref:target.adoc#frag[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should allow reference in distributed list', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      one::the one
      two::the two
      three::xref:target.adoc#frag[]
      `
      )
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should use component version asciidoc config if available', () => {
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment {fromcomponentversionconfig}
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[here]
      `
      )
      contentCatalog.getComponentVersion('test', '1.0').asciidoc = {
        attributes: { fromcomponentversionconfig: 'test' },
      }
      run()
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should stub missing fragment when pattern matches', () => {
      const extensionConfig = {
        stub: ['target.*'],
      }
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#missing[here]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should stub missing reference without fragment when pattern matches', () => {
      const extensionConfig = {
        stub: ['target.*'],
      }
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc[here]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should stub missing fragment and use xref if no text when pattern matches', () => {
      const extensionConfig = {
        stub: ['target.*'],
      }
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#missing[]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#">[target.adoc#missing]</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should not stub missing fragment when pattern does not match', () => {
      const extensionConfig = {
        stub: ['target.*'],
      }
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:tegrat.adoc[here]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="#tegrat.adoc" class="xref unresolved">here</a>')
      expect(
        loggerDestination.messages.some(
          (message) => message.includes('"level":"error"') && message.includes('target of xref not found: tegrat.adoc')
        )
      ).to.be.true()
    })

    it('should not stub fragment when reference exists', () => {
      const extensionConfig = {
        stub: ['target.*'],
      }
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[here]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should log warning when feature enabled link text matches target', () => {
      const extensionConfig = {
        logUnnecessaryLinkTextWarnings: true,
      }
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[Fragment]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(
        loggerDestination.messages.some(
          (message) =>
            message.includes('"level":"warn"') &&
            message.includes('unnecessary xref link text: target.adoc#frag[Fragment]')
        )
      ).to.be.true()
    })

    it('should not log warning when feature enabled link text is different from target', () => {
      const extensionConfig = {
        logUnnecessaryLinkTextWarnings: true,
      }
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[here]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">here</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    it('should not log warning when feature disabled link text matches target', () => {
      const extensionConfig = {
        logUnnecessaryLinkTextWarnings: false,
      }
      addFile(
        'target.adoc',
        heredoc`
      = Target

      [[frag]]
      == Fragment
      The Fragment
      `
      )
      addFile(
        'xref.adoc',
        heredoc`
      = Xref

      Go read xref:target.adoc#frag[Fragment]
      `
      )
      run(extensionConfig)
      const page = contentCatalog.getPages((candidate) => candidate.path === '/xref.adoc')[0]
      expect(page.contents.toString()).to.include('<a href="target.adoc#frag" class="xref page">Fragment</a>')
      expect(loggerDestination.messages).to.be.empty()
    })

    function addFile (filename, contents) {
      contents = Buffer.from(contents)
      const mediaType = 'text/asciidoc'
      const src = {
        component: 'test',
        version: '1.0',
        module: 'ROOT',
        family: 'page',
        relative: filename,
      }
      const file = { contents, mediaType, out: { path: filename }, src, dirname: '/', path: filename }
      contentCatalog.addFile(file)
      return file
    }

    function run (extensionConfig) {
      ext.register.call(generatorContext, { config: extensionConfig })
      generatorContext.contextStarted()
      const asciiDocConfig = generatorContext.resolveAsciiDocConfig()
      convertDocuments(contentCatalog, asciiDocConfig)
    }

    function createGeneratorContext () {
      return {
        once (eventName, fn) {
          this[eventName] = fn
        },
        getLogger: logger.getLogger,
        getFunctions () {
          return { loadAsciiDoc, resolveAsciiDocConfig }
        },
        replaceFunctions (updates) {
          this.resolveAsciiDocConfig = updates.resolveAsciiDocConfig
        },
      }
    }
  })
})
