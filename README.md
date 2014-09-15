deplink
=======

[![Build Status](https://travis-ci.org/hawky-4s-/npm-deplink.png)](https://travis-ci.org/hawky-4s-/npm-deplink)
[![Dependency Status](https://gemnasium.com/hawky-4s-/npm-deplink.svg)](https://gemnasium.com/hawky-4s-/npm-deplink)

A small library which aims to help you managing your project dependencies during development.

## Installation

  npm install -g deplink

## Usage

  // link with npm link
  var deplink = require('deplink');
  var dependencyLinker = new DependencyLinker('myRootDirectory');
  dependencyLinker.link();


  // link with symlinks
  var deplink = require('deplink');

  var options = { useSymlinks: true };
  var dependencyLinker = new DependencyLinker('myRootDirectory', options);
  dependencyLinker.link();


## Tests

  grunt test

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.

## Release History

* 0.1.0 Initial release