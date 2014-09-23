'use strict';

var _ = require('lodash'),
    path = require('path'),
    shell = require('shelljs');

var DependencyLinker = require('../../../');
var debugOptions = { dryRun: true, logLevel: 'debug' };

var TEST_RESOURCS_DIR = 'test/resources';
var ABSOLUTE_TEST_RESOURCES_DIR = path.resolve(TEST_RESOURCS_DIR);


describe('DependencyLinker', function() {

  describe('#link', function() {

    it('should link all dependencies with npm link', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

      dependencyLinker.link(null, function(err, result) {
        expect(err).to.be.undefined;

        expect(result).to.have.members([
            'cd test/resources/test1',
            'npm install',
            'npm link',
            'cd test/resources/test3-cyclic',
            'npm install',
            'npm link',
            'cd test/resources/test4-cyclic',
            'npm link test3',
            'npm install',
            'npm link',
            'cd test/resources/test3-cyclic',
            'npm link test4',
            'cd test/resources/test2',
            'npm link test1 test3',
            'npm install'
        ]);
      });
    });

    it('should link all dependencies with symlinks', function() {
      _.extend(debugOptions, { symlinks: true });

      console.log('CWD: ', process.cwd());

      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

      dependencyLinker.link(null, function(err, result) {
        expect(err).to.be.undefined;

        console.log(result);
        // TODO: change commands to use and return relative paths instead of absolute ones
        expect(result).to.have.members([
          'cd test/resources/test1',
          'npm install',
          'cd test/resources/test3-cyclic',
          'ln -s test/resources/test4-cyclic node_modules/test4',
          'npm install',
          'cd test/resources/test2',
          'ln -s test/resources/test1 node_modules/test1',
          'ln -s test/resources/test3-cyclic node_modules/test3',
          'npm install'
        ]);
      });
    });

  });

});