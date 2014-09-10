'use strict';

var _ = require('lodash'),
    path = require('path');

var DependencyLinker = require('../../../');
var debugOptions = { dryRun: true };

var TEST_RESOURCS_DIR = 'test/resources';
var ABSOLUTE_TEST_RESOURCES_DIR = path.resolve(TEST_RESOURCS_DIR);


describe('DependencyLinker', function() {

  describe('#getDirectories', function() {

    it('should get directories with absolute path from a folder', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR);

      var dirs = dependencyLinker.getDirectories(TEST_RESOURCS_DIR);

      var expectedDirs = [
        ABSOLUTE_TEST_RESOURCES_DIR + '/test1',
        ABSOLUTE_TEST_RESOURCES_DIR + '/test2',
        ABSOLUTE_TEST_RESOURCES_DIR + '/test3-cyclic',
        ABSOLUTE_TEST_RESOURCES_DIR + '/test4-cyclic'
      ];

      expect(dirs).to.have.members(expectedDirs);

    });

  });


  describe('#discoverDependenciesForProject', function() {

    it('should return nothing from a directory without a package.json', function() {
      var dependencyLinker = new DependencyLinker(null);

      var testEmptyPath = path.resolve(TEST_RESOURCS_DIR + '/empty');
      dependencyLinker.readDependencyDescriptorForProject(testEmptyPath, function(err, data) {
        expect(data).to.be.null;
      });
    });

    it('should return a dependency object from a directory with a package.json', function() {
      var dependencyLinker = new DependencyLinker(null);

      var testPath = path.resolve(TEST_RESOURCS_DIR + '/test1');

      var expectedPath =  path.join(process.cwd(), TEST_RESOURCS_DIR, 'test1');
      dependencyLinker.readDependencyDescriptorForProject(testPath, function(err, data) {
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
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR);

      dependencyLinker.discoverDependencies(TEST_RESOURCS_DIR, function(err, result) {
        if (err) {
          throw new Error('Unable to get dependencies for directory: ' + TEST_RESOURCS_DIR);
        }
        var dependencies = result;

        expect(_.keys(dependencies)).to.have.length(4);
        _.forEach(dependencies, function(projectDep) {
          expect(projectDep).to.have.keys(['name', 'path', 'dependencies']);
        });
      });

    });

  });


  describe('#link', function() {

    it('should link all dependencies', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

      dependencyLinker.link();
    });

  });

});