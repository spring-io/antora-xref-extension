/* eslint-env mocha */
'use strict'

process.env.NODE_ENV = 'test'

const chai = require('chai')
chai.use(require('chai-fs'))
chai.use(require('dirty-chai'))
const expect = chai.expect

const { configureLogger } = require('@antora/logger')

beforeEach(() => configureLogger({ level: 'silent' }))

function heredoc (literals, ...values) {
  const str =
    literals.length > 1
      ? values.reduce((accum, value, idx) => accum + value + literals[idx + 1], literals[0])
      : literals[0]
  const lines = str.trimRight().split(/^/m)
  if (lines.length < 2) return str
  if (lines[0] === '\n') lines.shift()
  const indentRx = /^ +/
  const indentSize = Math.min(...lines.filter((l) => l.startsWith(' ')).map((l) => l.match(indentRx)[0].length))
  return (indentSize ? lines.map((l) => (l.startsWith(' ') ? l.substr(indentSize) : l)) : lines).join('')
}

module.exports = {
  expect,
  heredoc,
}
