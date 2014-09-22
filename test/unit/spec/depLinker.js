'use strict';

var _ = require('lodash'),
    path = require('path'),
    shell = require('shelljs');

var DependencyLinker = require('../../../');
var debugOptions = { dryRun: true };

var TEST_RESOURCS_DIR = 'test/resources';
var ABSOLUTE_TEST_RESOURCES_DIR = path.resolve(TEST_RESOURCS_DIR);


describe('DependencyLinker', function() {

  describe('#link', function() {

    it('should link all dependencies', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

      dependencyLinker.link(null, function(err, result) {
        expect(err).to.be.undefined;
      });
    });

//    it('test ln cmd', function() {
//      shell.ln('-s', process.cwd() + '../bpmn-moddle', '/Users/hawky4s/development/bpmn.io/bpmn-io-app-cloud-builder/node_modules/bpmn-moddle');
//    });

  });

});