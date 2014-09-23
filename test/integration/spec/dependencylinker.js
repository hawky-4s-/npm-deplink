'use strict';

var _ = require('lodash'),
    path = require('path');

var DependencyLinker = require('../../../');
var debugOptions = { dryRun: true };

var TEST_RESOURCS_DIR = 'test/resources';
var ABSOLUTE_TEST_RESOURCES_DIR = path.resolve(TEST_RESOURCS_DIR);


describe('DependencyLinker', function() {

  describe('#bpmn-io', function() {

    // works on a checked out version of bpmn.io
    it('link bpmn-io dependencies', function() {
      var bpmnIoRepositories = [
        "diagram-js",
        "diagram-js-direct-editing",
        "moddle",
        "moddle-xml",
        "bpmn-js",
        "bpmn-js-cli",
        "bpmn-moddle",
        "ids",
        "bpmn-js-integration",
        "bpmn-miwg-test-suite"
      ];

      var shell = require('shelljs');
      shell.config.silent = false;
      shell.config.fatal = true;

      // create temp path
      var testPath = path.join(process.cwd().concat('/../dependency-linker-generated-it', '/bpmn.io'));
      if (shell.test('-e', testPath)) {
        shell.rm('-rf', testPath);
      }
      shell.mkdir('-p', testPath);

      // checkout repositories
      shell.cd(testPath);
      _.forEach(bpmnIoRepositories, function(repository) {
        shell.exec('git clone git://github.com/bpmn-io/' + repository + '.git');
      });

      var dependencyLinker = new DependencyLinker(testPath, { logLevel: 'debug', dryRun: false, verbose: true });

      dependencyLinker.link(null, function(err, result) {
        expect(err).to.be.undefined;
      });
    });

  });

});