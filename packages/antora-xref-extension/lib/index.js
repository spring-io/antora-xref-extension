'use strict'

const toProc = (fn) => Object.defineProperty(fn, '$$arity', { value: fn.length })
const xrefRegex = /xref:(\S+?)\[(|.*?[^\\])\]/g

function register ({ config }) {
  const stubs = config?.stub && config.stub.map((stub) => new RegExp(stub))
  let disableProcessing
  let componentVersionAsciiDocConfigs

  this.once('contextStarted', () => {
    const { resolveAsciiDocConfig: resolveAsciiDocConfigDelegate, loadAsciiDoc } = this.getFunctions()
    this.replaceFunctions({
      resolveAsciiDocConfig: (playbook) => resolveAsciiDocConfig(resolveAsciiDocConfigDelegate, loadAsciiDoc, playbook),
    })
  })

  function resolveAsciiDocConfig (resolveAsciiDocConfigDelegate, loadAsciiDoc, playbook) {
    const siteAsciiDocConfig = resolveAsciiDocConfigDelegate(playbook)
    siteAsciiDocConfig.keepSource = true
    siteAsciiDocConfig.extensions = siteAsciiDocConfig.extensions || []
    siteAsciiDocConfig.extensions.push({
      register: (registry, context) => registerAsciiDocExtension(loadAsciiDoc, siteAsciiDocConfig, registry, context),
    })
    return siteAsciiDocConfig
  }

  function registerAsciiDocExtension (loadAsciiDoc, siteAsciiDocConfig, registry, context) {
    registry.$groups().$store(
      'antora/antora-xref-extension',
      toProc(function () {
        this.treeProcessor(function () {
          this.process((doc) => process(loadAsciiDoc, context, siteAsciiDocConfig, doc))
        })
      })
    )
  }

  function process (loadAsciiDoc, context, siteAsciiDocConfig, doc) {
    if (disableProcessing) return
    const { file, contentCatalog } = context
    const lookup = (resourceId) => {
      const resource = contentCatalog.resolveResource(resourceId, file.src)
      if (!resource || (resource.mediaType !== 'text/asciidoc' && !resource.src.contents)) {
        return null
      }
      if (!resource.src.asciiDocRefs) {
        resource.src.asciiDocRefs = loadAsciiDocRefs((resource) => {
          if (file.path === resource.path) return doc
          const asciiDocConfigForFile = getAsciiDocConfigForFile(contentCatalog, siteAsciiDocConfig, file)
          return loadAsciiDoc(resource, contentCatalog, asciiDocConfigForFile)
        }, resource)
      }
      return resource.src.asciiDocRefs
    }
    processNode(file.src, doc, lookup)
  }

  function getAsciiDocConfigForFile (contentCatalog, siteAsciiDocConfig, file) {
    if (!componentVersionAsciiDocConfigs) {
      componentVersionAsciiDocConfigs = new Map()
      contentCatalog.getComponents().forEach(({ name, versions }) => {
        versions.forEach(({ version, asciidoc }) => {
          componentVersionAsciiDocConfigs.set(version + '@' + name, asciidoc)
        })
      })
    }
    const { component, version } = file.src
    return componentVersionAsciiDocConfigs.get(version + '@' + component) || siteAsciiDocConfig
  }

  function loadAsciiDocRefs (loadAsciiDoc, resource) {
    disableProcessing = true
    const doc = loadAsciiDoc(asAsciiDocResource(resource))
    disableProcessing = false
    const asciiDocRefs = {}
    for (const [name, node] of Object.entries(doc.getRefs())) {
      const reftext = node.getAttribute('reftext', node.getTitle ? node.getTitle() : '')
      asciiDocRefs[name] = { node, reftext }
    }
    return asciiDocRefs
  }

  function asAsciiDocResource (resource) {
    if (!resource.src.contents) {
      return resource
    }
    const asciiDocResource = resource.clone()
    asciiDocResource.contents = resource.src.contents
    asAsciiDocResource.mediaType = 'text/asciidoc'
    return asciiDocResource
  }

  function processNode (src, node, lookup) {
    const context = node.getContext()
    if (context === 'paragraph' || context === 'admonition') {
      const lines = node.lines
      for (let i = 0; i < lines.length; i++) {
        lines[i] = processLine(src, node, lines[i], lookup)
      }
    } else if (context === 'table') {
      const rows = node.getRows()
      rows.getHead().forEach((row) => row.forEach((cell) => processNode(src, cell, lookup)))
      rows.getBody().forEach((row) => row.forEach((cell) => processNode(src, cell, lookup)))
      rows.getFoot().forEach((row) => row.forEach((cell) => processNode(src, cell, lookup)))
    } else if (context === 'table_cell' || context === 'list_item') {
      node.text = processLine(src, node, node.text, lookup)
    }
    node.getBlocks().forEach((child) => processNode(src, child, lookup))
  }

  function processLine (src, block, line, lookup) {
    return line.replace(xrefRegex, (match, reference, linkText) => {
      const fragmentIndex = reference.lastIndexOf('#')
      const resourceId = fragmentIndex !== -1 ? reference.slice(0, fragmentIndex) : reference
      const fragment = fragmentIndex !== -1 ? reference.slice(fragmentIndex + 1) : null
      const asciiDocRefs = fragment && lookup(resourceId, fragment)
      const target = asciiDocRefs && asciiDocRefs[fragment]
      if (!asciiDocRefs || !target) {
        if (stubs) {
          if (stubs.some((stub) => reference.match(stub))) {
            linkText = linkText !== '' ? linkText : `+++[${reference}]+++`
            return `xref:${src.relative}[${linkText}]`
          }
        }
        if (!asciiDocRefs) {
          return match
        }
        log(block, 'error', `target fragement of xref not found: ${resourceId}#${fragment}`)
        return match
      }
      if (config?.logUnnecessaryLinkTextWarnings && linkText === target.reftext) {
        log(block, 'warn', `unnecessary xref link text: ${resourceId}#${fragment}[${linkText}]`)
      }
      linkText = linkText !== '' ? linkText : target.reftext
      if (linkText === '') log(block, 'warn', `target has no reftext: ${resourceId}#${fragment}`)
      return `xref:${resourceId}#${fragment}[${linkText}]`
    })
  }

  function log (node, severity, message) {
    node.getLogger()[severity](node.createLogMessage(message, { source_location: node.getSourceLocation() }))
  }
}

module.exports = { register }
