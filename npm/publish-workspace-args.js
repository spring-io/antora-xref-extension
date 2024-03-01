'use strict'

const fs = require('fs')
const ospath = require('path')

const PROJECT_ROOT_DIR = ospath.join(__dirname, '..')
const PACKAGES_DIR = ospath.join(PROJECT_ROOT_DIR, 'packages')

process.stdout.write(
  fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .reduce((accum, dirent, pkg) => {
      return dirent.isDirectory() && !(pkg = require(ospath.join(PACKAGES_DIR, dirent.name, 'package.json'))).private
        ? accum.concat(`--workspace ${pkg.name}`)
        : accum
    }, [])
    .join(' ')
)
