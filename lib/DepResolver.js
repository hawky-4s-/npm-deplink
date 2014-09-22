'use strict';

var path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    winston = require('winston'),
    async = require('async'),
    CommandFactory = require('./CmdFactory');

var DEPENDENCIES_DESCRIPTOR = 'package.json';
var DEFAULT_NUM_OF_RETRIES = 3;

var DRY_RUN = false;
var LOG_JSON = false;

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: true,
      handleExceptions: true,
      json: LOG_JSON
    })
  ]
});


function DependencyResolver(rootDirectory, options) {

  /*jshint -W069 */
  rootDirectory = rootDirectory || process.env['DEPLINK_ROOT'] || process.cwd() + '/..';
  this._rootDirectory = rootDirectory;
  options = options || {};

  this._loglevel = options.logLevel || 'info';
  this._verbose = options.verbose || false;

  DRY_RUN = options.dryRun || false;
  LOG_JSON = options.logJson || false;
  logger.transports.console.level = this._loglevel;

  this.cmdFactory = new CommandFactory(options);
};


/**
 * Retrieves all first level child directories using the given parent directory as starting point.
 * @param  {String} rootDirectory
 * @return {Array} array of child directories with prefixed parent directory
 */
DependencyResolver.prototype.getDirectories = function(rootDirectory) {
  var parentDir = path.join(rootDirectory);

  var childDirs = fs.readdirSync(parentDir).filter(function(file) {
    var childDir = path.join(parentDir, file);
    return fs.statSync(childDir).isDirectory() &&
           fs.existsSync(path.join(childDir, DEPENDENCIES_DESCRIPTOR));
  });

  var directories = [];
  // try with map
  _.forEach(childDirs, function(childDir) {
    directories.push(path.join(parentDir, childDir));
  });

  return directories;
};


/**
 * Reads the dependency descriptor (package.json) from a node project and returns the dependencies
 * in a callback.
 * @param directory
 * @param callback
 */
DependencyResolver.prototype.readProjectDependencyDescriptor = function(directory, callback) {
  var pkgJsonPath = path.join(directory, DEPENDENCIES_DESCRIPTOR);
  logger.debug("PkgJsonPath: ", pkgJsonPath);

  fs.readFile(pkgJsonPath, function(err, data) {
    if (err) {
      return callback(err, null);
    }

    var parsedPkgJson = JSON.parse(data);
    var dependencies = {};
    _.extend(dependencies, parsedPkgJson.dependencies || {});
    _.extend(dependencies, parsedPkgJson.devDependencies || {});

    callback(null, { name: parsedPkgJson.name, path: directory, dependencies: dependencies });
  });
};


/**
 *
 * @param rootDirectory
 * @param callback
 */
DependencyResolver.prototype.discoverDependencies = function(rootDirectory, callback) {
  var directories = this.getDirectories(rootDirectory);

  logger.debug("Discover from directories: ", directories);

  async.map(directories, this.readProjectDependencyDescriptor, function(err, result) {
    if (err) {
      return callback(err, null);
    }

    var moduleDependenciesByModule = {};

    _.forEach(result, function(module) {
      moduleDependenciesByModule[module.name] = module;
    });

    logger.debug("discoveredDependencies", moduleDependenciesByModule);

    return callback(null, moduleDependenciesByModule);
  });
};


/**
 * 
 * @param moduleDependencies
 * @param customCmds
 * @returns {Array}
 */
DependencyResolver.prototype.analyzeDependencies = function(moduleDependencies, customCmds, linkFunction) {
  var dependencyTree = this.buildDependencyTree(moduleDependencies);
  var cmds = [];
  var retries = DEFAULT_NUM_OF_RETRIES;
  var unresolvedDependencies = dependencyTree;
  var solvedDependencies = [];

  var dependenciesResolved = function() {
    return _.keys(unresolvedDependencies).length === 0;
  }

  while (!dependenciesResolved() && retries > 0) {
    this.resolveDependency(unresolvedDependencies, solvedDependencies,  dependencyTree, moduleDependencies, linkFunction, this.cmdFactory, function(solvedDependency, dependencyCmds, hasCyclicDep) {
      if (solvedDependency) {
        logger.debug('adding customCmds to dependencyCmds', customCmds);
        if (!hasCyclicDep) {
          dependencyCmds = Array.prototype.concat.apply(dependencyCmds, customCmds);
        } else {
          dependencyCmds = Array.prototype.concat.apply(dependencyCmds, customCmds);
        }

        logger.debug('adding dependencyCmds to cmds', dependencyCmds);
        cmds = Array.prototype.concat.apply(cmds, dependencyCmds);

        // reset retries
        retries = DEFAULT_NUM_OF_RETRIES;
      }
    });

    retries--;
  };

  if (!dependenciesResolved()) {
    throw new Error("Unable to fully resolve dependencies: " + JSON.stringify(unresolvedDependencies));
  }

  logger.debug("unresolvedDependencies", unresolvedDependencies);
  logger.debug("solvedDependencies", solvedDependencies);

  return cmds;
};


/**
 * 
 * @param moduleDependencies
 * @returns {{}}
 */
DependencyResolver.prototype.buildDependencyTree = function(moduleDependencies) {
  var referencedByModules = getReferencedByModules(moduleDependencies);
  var cyclicDeps = this.getCyclicModuleDependencies(moduleDependencies, referencedByModules);
  var moduleNames = _.keys(referencedByModules);
  var dependsOnModules = this.getDependsOnModules(moduleDependencies, moduleNames);


  var dependencyTree = {};
  _.forEach(moduleNames, function (moduleName) {

    var dependsOn = dependsOnModules[moduleName].length > 0 ? dependsOnModules[moduleName] : [];
    var referencedBy = referencedByModules[moduleName].length > 0 ? referencedByModules[moduleName] : [];
    var hasCyclicDep = cyclicDeps[moduleName] ? true : false;

    dependencyTree[moduleName] = { name: moduleName, dependsOn: dependsOn, referencedBy: referencedBy, hasCyclicDep: hasCyclicDep };
    logger.debug("moduleName=", moduleName, ",dependsOn=", dependsOn, ",referencedBy=", referencedBy, ",hasCyclicDep=", hasCyclicDep);
  });
  return dependencyTree;
};


DependencyResolver.prototype.resolveDependency = function(unresolvedDependencies, solvedDependencies, dependencyTree, moduleDependencies, linkFunction, cmdFactory, callback) {
  var isDependencyResolved = false;
  var retries = _.keys(unresolvedDependencies).length;
  var cmds = [];

  var solvedDependency = null;
  var solvedCyclicDependency = false;

  while(!isDependencyResolved && retries > 0) {
    _.some(unresolvedDependencies, function(unresolvedDependency) {

      var dependenciesMatch = _.isEqual(_.intersection(unresolvedDependency.dependsOn, solvedDependencies), unresolvedDependency.dependsOn);
      if (dependenciesMatch && !unresolvedDependency.hasCyclicDep) {

        var linkCmds = linkFunction(cmdFactory, unresolvedDependency, moduleDependencies, null, null);
        cmds = Array.prototype.concat.apply(cmds, linkCmds);

        solvedDependency = unresolvedDependency.name;
        solvedDependencies.push(solvedDependency);
        delete unresolvedDependencies[solvedDependency];

        return isDependencyResolved = true;

      } else if (unresolvedDependency.hasCyclicDep) {
        solvedCyclicDependency = false;

        _.some(unresolvedDependencies, function(cyclicDep) {

          // we only check other dependencies
          if (cyclicDep.name != unresolvedDependency.name && cyclicDep.hasCyclicDep) {
            // construct array of possible dependencies when we use it to fulfill our dep requirements for the current unresolved dep
            var tempDeps = [];
            tempDeps.push.apply(tempDeps, solvedDependencies);
            tempDeps.push.apply(tempDeps, [ cyclicDep.name ]);

            var tempDeps2 = [];
            tempDeps2.push.apply(tempDeps2, solvedDependencies);
            tempDeps2.push.apply(tempDeps2, [ unresolvedDependency.name ]);

            var intersection = _.intersection(unresolvedDependency.dependsOn, tempDeps);
            var dependenciesMatch = _.isEqual(intersection, unresolvedDependency.dependsOn);

            var intersection2 = _.intersection(cyclicDep.dependsOn, tempDeps2);
            var dependenciesMatch2 = _.isEqual(intersection2, cyclicDep.dependsOn);

            if (dependenciesMatch && dependenciesMatch2) {
              logger.debug("depname: ", cyclicDep.name, "- unresolvedDepname: ", unresolvedDependency.name)
              logger.debug("depLinks: ", cyclicDep.dependsOn)
              logger.debug("unresolvedDepLinks: ", unresolvedDependency.dependsOn)

              // first: link unresolvedDependency with all dependencies except cyclicDep
              cmds.push('cd ' + moduleDependencies[unresolvedDependency.name].path);
              if (unresolvedDependency.dependsOn.length > 0) {
                _.remove(unresolvedDependency.dependsOn, function(links) {
                  // exclude cyclicDep from linking
                  return links === cyclicDep.name;
                });

                if (unresolvedDependency.dependsOn.length > 0) {
                  cmds.push(cmdFactory.npmLink(unresolvedDependency.dependsOn));
                }
              }
              cmds.push(cmdFactory.npmInstall());
              cmds.push(cmdFactory.npmLink());

              // second: install and link cyclicDep
              cmds.push(cmdFactory.cd(moduleDependencies[cyclicDep.name].path));


              if (cyclicDep.dependsOn.length > 0) {
                cmds.push(cmdFactory.npmLink(cyclicDep.dependsOn));
              }
              cmds.push(cmdFactory.npmInstall());

              if (cyclicDep.referencedBy.length > 0) {
                cmds.push(cmdFactory.npmLink());
              }

              // third: link cyclicDep inside unresolvedDep
              cmds.push(cmdFactory.cd(moduleDependencies[unresolvedDependency.name].path));
              cmds.push(cmdFactory.npmLink( [cyclicDep.name] ));

              solvedDependency = [];
              solvedDependency.push(unresolvedDependency.name);
              solvedDependency.push(cyclicDep.name);

              solvedDependencies.push(unresolvedDependency.name);
              solvedDependencies.push(cyclicDep.name);

              delete unresolvedDependencies[unresolvedDependency.name];
              delete unresolvedDependencies[cyclicDep.name];

              return solvedCyclicDependency = true;
            }
          }

        });

        return isDependencyResolved = solvedCyclicDependency;

      } else {

        return false;

      }

    });

    // decrement so we will end after a while
    retries--;
  }

  return callback(solvedDependency, cmds, solvedCyclicDependency);
}


function getReferencedByModules(modules) {
  var referencedByModules = {};
  // which module is linked by other modules -> empty arr = can be linked safely
  _.forEach(modules, function(module) {

    var referencedBy = _(modules)
        .reject({ name : module.name })
        .filter(function(deps) {
          return _.contains(_.keys(deps.dependencies), module.name);
        })
        .map('name')
        .value();

    referencedByModules[module.name] = referencedBy;
  });

  logger.debug("referencedByModules", referencedByModules);

  return referencedByModules;
};


DependencyResolver.prototype.getCyclicModuleDependencies = function(modules, referencedByModules) {
  var cyclicDeps = {};
  // which modules have a bi directional relationship
  _.forEach(referencedByModules, function(referencedBy, moduleName) {

    var cyclicDep = _(modules)
        .filter(function(module) {
          return module.name == moduleName;
        })
        .filter(function(module) {
          var intersection = _.intersection(_.keys(module.dependencies), referencedBy);
          return intersection.length > 0;
        })
        .map('dependencies')
        .value();

    if (cyclicDep.length > 0) {
      cyclicDeps[moduleName] = _.keys(cyclicDep[0]);
    }

  })

  logger.debug("cyclicDeps", cyclicDeps);

  return cyclicDeps;
};


DependencyResolver.prototype.getDependsOnModules = function(moduleDependencies, moduleNames) {
  var linkedModulesByModule = {};

  _.forEach(moduleDependencies, function(module) {
    linkedModulesByModule[module.name] = _.intersection(_.keys(module.dependencies), moduleNames);
  })

  logger.debug("linkedModulesbyModule", linkedModulesByModule);
  return linkedModulesByModule;
};


module.exports = DependencyResolver;
