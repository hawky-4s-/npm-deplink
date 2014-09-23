#!/usr/bin/env node
var argv = require('yargs')
    .alias('s', 'symlinks')
    .describe('s', 'Use symlinks instead of npm link to connect the dependencies.')
    .alias('d', 'dryRun')
    .describe('d', 'Execute a dryRun without linking the dependencies.')
    .alias('v', 'verbose')
    .describe('v', 'Enable verbose output of operations.')
    .describe('debug', 'Enable debug mode.')
    .usage('Usage: $0 <workingDir> . Use --help for additional infos.')
    .example('$0 . -sd - Execute a dryrun using symlinks to connect the dependencies located in current directory.')
    .argv,

    _ = require('lodash');

var options = {};

if (argv._) {
  _.extend(options, { workingDir: argv._[0] });
} else {
  _.extend(options, { workingDir: process.cwd() });
}
if (argv.s) {
  _.extend(options, { symlinks: true });
  console.log('Using symlinks to connect dependencies.')
} else {
  console.log('Using \"npm link\" to connect dependencies.')
}
if (argv.d) {
  _.extend(options, { dryRun: true });
  console.log('Executing dryrun.')
}
if (argv.v) {
  _.extend(options, { verbose: true });
  console.log('Enabling verbose output.')
}
if (argv.debug) {
  _.extend(options, { logLevel: 'debug' });
  console.log('Set logLevel to debug.')
}

var callback = function(err, result) {
  if (err) {
    throw new Error(err);
  }
};

var DependencyLinker = require('./lib/DepLinker');
var dependencyLinker = new DependencyLinker(options.workingDir , options);
dependencyLinker.link(null, callback);
