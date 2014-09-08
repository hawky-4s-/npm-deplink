'use strict';

var _ = require('lodash');
var path = require('path');

var DependencyLinker = require('../../');
var debugOptions = { loglevel: 'debug' };

var TEST_RESOURCS_DIR = 'test/resources';
var ABSOLUTE_TEST_RESOURCES_DIR = path.resolve(TEST_RESOURCS_DIR);

describe('DependencyLinker', function() {

  describe('#link', function() {

    it.skip('should link dependent modules inside a root folder', function() {
    });

  });

  describe('#getDirectories', function() {

    it('should get directories with absolute path from a folder', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

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
      var dependencyLinker = new DependencyLinker(null, debugOptions);

      var testEmptyPath = path.resolve(TEST_RESOURCS_DIR + '/empty');
      dependencyLinker.discoverDependenciesForProject(testEmptyPath, function(err, data) {
        expect(data).to.be.null;
      });
    });

    it('should return dependencies from a directory with a package.json', function() {
      var dependencyLinker = new DependencyLinker(null, debugOptions);

      var testPath = path.resolve(TEST_RESOURCS_DIR + '/test1');
      dependencyLinker.discoverDependenciesForProject(testPath, function(err, data) {
        expect(data).to.deep.equal(
          {
            "path":"/Users/hawky4s/development/bpmn.io/dependency-linker/test/resources/test1",
            "dependencies":
            {
              "name":"test1",
              "version":"0.1.0",
              "description":"Discovers all projects inside a directory and links them through 'npm link' or symbolic links.",
              "main":"index.js",
              "scripts":{"test":"echo \"Error: no test specified\" && exit 1"},
              "repository":{"type":"git","url":"git://github.com/hawky-4s-/npm-dependency-linker.git"},
              "keywords":["link","dependency"],
              "author":"Christian Lipphardt <christian.lipphardt@camunda.com> (http://camunda.org/)",
              "license":"MIT",
              "dependencies":{"shelljs":"0.3.0","lodash":"2.4.1"}
            }
          })
      });
    });

  });

  describe('#discoverDependencies', function() {

    it('should return all dependencies from the child directories', function() {
      var dependencyLinker = new DependencyLinker(TEST_RESOURCS_DIR, debugOptions);

      var allDependencies = [];
      dependencyLinker.discoverDependencies(TEST_RESOURCS_DIR, function(result) {
        allDependencies = result;
      });

      console.log(allDependencies);

      var expectedDependencies = [{}, {}, {}, {}];
      expect(allDependencies).to.have.length(4);
      _.forEach(allDependencies, function(projectDep) {
        expect(projectDep).to.have.keys(['path', 'dependencies']);
      });
    });

  });

});