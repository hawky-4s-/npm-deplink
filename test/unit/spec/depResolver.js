'use strict';

var _ = require('lodash'),
    path = require('path'),
    shell = require('shelljs');

var DependencyResolver = require('../../../lib/DepResolver');
var debugOptions = { dryRun: true };

var TEST_RESOURCS_DIR = 'test/resources';
var RELATIVE_TEST_RESOURCES_DIR = path.join(TEST_RESOURCS_DIR);

describe('DependencyResolver', function() {

  describe('#getDirectories', function() {

    it('should get directories with absolute path from a folder', function() {
      var dependencyResolver = new DependencyResolver(TEST_RESOURCS_DIR);

      var dirs = dependencyResolver.getDirectories(TEST_RESOURCS_DIR);

      var expectedDirs = [
            RELATIVE_TEST_RESOURCES_DIR + '/test1',
            RELATIVE_TEST_RESOURCES_DIR + '/test2',
            RELATIVE_TEST_RESOURCES_DIR + '/test3-cyclic',
            RELATIVE_TEST_RESOURCES_DIR + '/test4-cyclic',
            RELATIVE_TEST_RESOURCES_DIR + '/test5-solo'
      ];

      expect(dirs).to.have.members(expectedDirs);

    });

  });


  describe('#discoverDependenciesForProject', function() {

    it('should return nothing from a directory without a package.json', function() {
      var dependencyResolver = new DependencyResolver(null);

      var testEmptyPath = path.resolve(TEST_RESOURCS_DIR + '/empty');
      dependencyResolver.readProjectDependencyDescriptor(testEmptyPath, function(err, data) {
        expect(data).to.be.null;
      });
    });

    it('should return a dependency object from a directory with a package.json', function() {
      var dependencyResolver = new DependencyResolver(null);

      var testPath = path.resolve(TEST_RESOURCS_DIR + '/test1');

      var expectedPath =  path.join(process.cwd(), TEST_RESOURCS_DIR, 'test1');
      dependencyResolver.readProjectDependencyDescriptor(testPath, function(err, data) {
        expect(data).to.deep.equal(
            {
              "name":"test1",
              "path":expectedPath,
              "dependencies":
              {
                "shelljs":"0.3.0",
                "lodash":"2.4.1",
                "q":"~1.0.1"
              }
            })
      });
    });

  });


  describe('#discoverDependencies', function() {

    it('should return all dependencies from the child directories', function() {
      var dependencyResolver = new DependencyResolver(TEST_RESOURCS_DIR);

      dependencyResolver.discoverDependencies(TEST_RESOURCS_DIR, function(err, result) {
        if (err) {
          throw new Error('Unable to get dependencies for directory: ' + TEST_RESOURCS_DIR);
        }
        var dependencies = result;

        expect(_.keys(dependencies)).to.have.length(5);
        _.forEach(dependencies, function(projectDep) {
          expect(projectDep).to.have.keys(['name', 'path', 'dependencies']);
        });
      });

    });

  });


});