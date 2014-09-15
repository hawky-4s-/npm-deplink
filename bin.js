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
    .example('$0 . -sd - Execute a dryrun using symlinks to connect the dependencies located in current directoy.')
    .argv,

    _ = require('lodash');

var options = {}

if (argv._) {
  _.extend(options, { workingDir: argv._[0] });
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

console.log('Options: ', options);

var DependencyLinker = require('./lib/DepLink');
var dependencyLinker = new DependencyLinker(options.workingDir , options);
dependencyLinker.link();
