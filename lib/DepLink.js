'use strict';

var shell = require('shelljs'),
    path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    winston = require('winston'),
    async = require('async');

var DEPENDENCIES_DESCRIPTOR = 'package.json';
var DEFAULT_NUM_OF_RETRIES = 3;

var DRY_RUN = false;
var LOG_JSON = false;
var USE_SYMLINK = false;

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: true,
      handleExceptions: true,
      json: LOG_JSON
    })
  ]
});


/**
 * Create a new DependencyLinker instance.
 *
 * You may optionally provide a rootDirectory otherwise the env variable 'DEPLINK_ROOT' is
 * used or if it is not set, parent directory of the process is used.
 *
 * @param {String} rootDirectory
 */
function DependencyLinker(rootDirectory, options) {
  /*jshint -W069 */
  rootDirectory = rootDirectory || process.env['DEPLINK_ROOT'] || process.cwd() + '/..';
  this._rootDirectory = rootDirectory;

  options = options || {};
  this._loglevel = options.logLevel || 'info';
  this._verbose = options.verbose || false;

  USE_SYMLINK = options.symlinks || false;
  DRY_RUN = options.dryRun || false;
  LOG_JSON = options.logJson || false;

  logger.transports.console.level = this._loglevel;
  shell.config.silent = !this._verbose;
  shell.config.fatal = options.haltOnErrors || true;
}


DependencyLinker.prototype.link = function(customCmds, callback) {
  var self = this;

  this.discoverDependencies(this._rootDirectory, function(err, result) {
    if (err) {
      return callback(err);
    }

    var moduleDependencies = result;
    var cmds = self.analyzeDependencies(moduleDependencies, customCmds);

    logger.debug("Commands: ", cmds);

    self.executeCmds(cmds);

    return callback(null);
  });
};


/**
 * Retrieves all first level child directories using the given parent directory as starting point.
 * @param  {String} directory
 * @return {Array} array of child directories with prefixed parent directory
 */
DependencyLinker.prototype.getDirectories = function(directory) {
  logger.debug("Directory: ", directory);

  var parentDir = normalizeDir(directory);
  logger.debug("NormalizedDirectory: ", parentDir);

  var childDirs = fs.readdirSync(parentDir).filter(function(file) {
    var childDir = path.join(parentDir, file);
    return fs.statSync(childDir).isDirectory() && fs.existsSync(path.join(childDir, DEPENDENCIES_DESCRIPTOR));
  });
  logger.debug("ChildDirs: ", childDirs);

  var normalizedDirs = [];
  _.forEach(childDirs, function(childDir) {
    normalizedDirs.push(path.join(parentDir, childDir));
  });
  logger.debug("NormalizedChildDirs: ", normalizedDirs);

  return normalizedDirs;
};


DependencyLinker.prototype.readDependencyDescriptorForProject = function(directory, callback) {
  logger.debug("Discover dependencies for directory: ", directory);

  var pkgJson = path.join(directory, DEPENDENCIES_DESCRIPTOR);
  logger.debug("PathPkgJson: ", pkgJson);

  fs.readFile(pkgJson, function(err, data) {
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


DependencyLinker.prototype.analyzeDependencies = function(moduleDependencies, customCmds) {
  var dependencyTree = buildDependencyTree(moduleDependencies);
  var cmds = [];
  var retries = DEFAULT_NUM_OF_RETRIES;
  var unresolvedDependencies = dependencyTree;
  var solvedDependencies = [];

  var dependenciesResolved = function() {
    return _.keys(unresolvedDependencies).length === 0;
  }

  while (!dependenciesResolved() && retries > 0) {
    resolveDependency(unresolvedDependencies, solvedDependencies,  dependencyTree, moduleDependencies, function(solvedDependency, dependencyCmds, isCyclicDep) {
      if (solvedDependency) {
        logger.debug('adding customCmds to dependencyCmds', customCmds);
        if (!isCyclicDep) {
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


DependencyLinker.prototype.executeCmds = function(cmds) {
  _.forEach(cmds, function(cmd) {
    if (!DRY_RUN) {
      logger.info("Executing cmd: " + cmd);
      if (cmd.indexOf('cd') == 0) {
        shell.cd(cmd.substring(3));
      }
      shell.exec(cmd);
    } else {
      logger.info("Cmd: ", cmd);
    }
  });

};


DependencyLinker.prototype.discoverDependencies = function(rootDirectory, callback) {
  var directories = this.getDirectories(rootDirectory);

  logger.debug("Discover from directories: ", directories);

  async.map(directories, this.readDependencyDescriptorForProject, function(err, result) {
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


/* ----------------------------- private functions ----------------------------- */

function buildDependencyTree(moduleDependencies) {
  var linkedByModules = getLinkedByModules(moduleDependencies);
  var cyclicDeps = getCyclicModuleDependencies(moduleDependencies, linkedByModules);
  var moduleNames = _.keys(linkedByModules);
  var linksToModules = getLinkedModules(moduleDependencies, moduleNames);


  var dependencyTree = {};
  _.forEach(moduleNames, function (moduleName) {

    var linksTo = linksToModules[moduleName].length > 0 ? linksToModules[moduleName] : [];
    var linkedBy = linkedByModules[moduleName].length > 0 ? linkedByModules[moduleName] : [];
    var isCyclicDep = cyclicDeps[moduleName] ? true : false;

    dependencyTree[moduleName] = { name: moduleName, linksTo: linksTo, linkedBy: linkedBy, isCyclicDep: isCyclicDep };
    logger.debug("moduleName=", moduleName, ",linksto=", linksTo, ",linkedBy=", linkedBy, ",isCyclicDep=", isCyclicDep);
  });
  return dependencyTree;
};


function resolveDependency(unresolvedDependencies, solvedDependencies, dependencyTree, moduleDependencies, callback) {
  var isDependencyResolved = false;
  var retries = _.keys(unresolvedDependencies).length;
  var cmds = [];

  var solvedDependency = null;
  var solvedCyclicDependency = false;

  while(!isDependencyResolved && retries > 0) {
    _.some(unresolvedDependencies, function(unresolvedDependency) {

      var createLinkCmds = USE_SYMLINK ? symlinkModule : npmlinkModule;

      var dependenciesMatch = _.isEqual(_.intersection(unresolvedDependency.linksTo, solvedDependencies), unresolvedDependency.linksTo);
      if (dependenciesMatch && !unresolvedDependency.isCyclicDep) {

        var linkCmds = createLinkCmds(unresolvedDependency, moduleDependencies);
        cmds = Array.prototype.concat.apply(cmds, linkCmds);

        solvedDependency = unresolvedDependency.name;
        solvedDependencies.push(solvedDependency);
        delete unresolvedDependencies[solvedDependency];

        return isDependencyResolved = true;

      } else if (unresolvedDependency.isCyclicDep) {
        solvedCyclicDependency = false;

        _.some(unresolvedDependencies, function(cyclicDep) {

          // we only check other dependencies
          if (cyclicDep.name != unresolvedDependency.name && cyclicDep.isCyclicDep) {
            // construct array of possible dependencies when we use it to fulfill our dep requirements for the current unresolved dep
            var tempDeps = [];
            tempDeps.push.apply(tempDeps, solvedDependencies);
            tempDeps.push.apply(tempDeps, [ cyclicDep.name ]);

            var tempDeps2 = [];
            tempDeps2.push.apply(tempDeps2, solvedDependencies);
            tempDeps2.push.apply(tempDeps2, [ unresolvedDependency.name ]);

            var intersection = _.intersection(unresolvedDependency.linksTo, tempDeps);
            var dependenciesMatch = _.isEqual(intersection, unresolvedDependency.linksTo);

            var intersection2 = _.intersection(cyclicDep.linksTo, tempDeps2);
            var dependenciesMatch2 = _.isEqual(intersection2, cyclicDep.linksTo);

            if (dependenciesMatch && dependenciesMatch2) {
              logger.debug("dependenciesMatch", dependenciesMatch)
              logger.debug("dependenciesMatch2", dependenciesMatch2)
              logger.debug("intersection", intersection)
              logger.debug("intersection2", intersection2)

              logger.debug("depname: ", cyclicDep.name, "- unresolvedDepname: ", unresolvedDependency.name)
              logger.debug("depLinks: ", cyclicDep.linksTo)
              logger.debug("unresolvedDepLinks: ", unresolvedDependency.linksTo)

              // first: link unresolvedDependency with all dependencies except cyclicDep
              cmds.push('cd ' + moduleDependencies[unresolvedDependency.name].path);
              if (unresolvedDependency.linksTo.length > 0) {
                _.remove(unresolvedDependency.linksTo, function(links) {
                  // exclude cyclicDep from linking
                  return links === cyclicDep.name;
                });
                if (unresolvedDependency.linksTo.length > 0) {
                  cmds.push('npm link ' + unresolvedDependency.linksTo.join(' '));
                }
              }
              cmds.push('npm install');
              cmds.push('npm link');

              // second: install and link cyclicDep
              cmds.push('cd ' + moduleDependencies[cyclicDep.name].path);
              if (cyclicDep.linksTo.length > 0) {
                cmds.push('npm link ' + cyclicDep.linksTo.join(' '));
              }
              cmds.push('npm install');
              if (cyclicDep.linkedBy.length > 0) {
                cmds.push('npm link');
              }

              // third: link cyclicDep inside unresolvedDep
              cmds.push('cd ' + moduleDependencies[unresolvedDependency.name].path);
              cmds.push('npm link ' + cyclicDep.name);

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


function getLinkedByModules(modules) {
  var linkedByModules = {};
  // which module is linked by other modules -> empty arr = can be linked safely
  _.forEach(modules, function(module) {

    var linkedBy = _(modules)
    .reject({ name : module.name })
    .filter(function(deps) {
      return _.contains(_.keys(deps.dependencies), module.name);
    })
    .map('name')
    .value();

    linkedByModules[module.name] = linkedBy;
  });

  logger.debug("linkedByModules", linkedByModules);

  return linkedByModules;
};


function getCyclicModuleDependencies(modules, linkedByModules) {
  var cyclicDeps = {};
  // which modules have a bi directional relationship
  _.forEach(linkedByModules, function(linkedBy, moduleName) {

    var cyclicDep = _(modules)
    .filter(function(module) {
      return module.name == moduleName;
    })
    .filter(function(module) {
      var intersection = _.intersection(_.keys(module.dependencies), linkedBy);
      return intersection.length > 0;
    })
    .map('dependencies')
    .value()

    if (cyclicDep.length > 0) {
      cyclicDeps[moduleName] = _.keys(cyclicDep[0]);
    }

  })

  logger.debug("cyclicDeps", cyclicDeps);

  return cyclicDeps;
};


function getLinkedModules(moduleDependencies, moduleNames) {
  var linkedModulesByModule = {};

  _.forEach(moduleDependencies, function(module) {
    linkedModulesByModule[module.name] = _.intersection(_.keys(module.dependencies), moduleNames);
  })

  logger.debug("linkedModulesbyModule", linkedModulesByModule);
  return linkedModulesByModule;
}


function normalizeDir(directory) {
  return path.join(directory);
};


function npmlinkModule(currentModule, moduleDependencies, cyclicModuleDep, isCyclicDep) {
  var cmds = [];

  var linksTo = currentModule.linksTo.length > 0;
  var linkedBy = currentModule.linkedBy.length > 0;

  var modulePath = moduleDependencies[currentModule.name].path;

  if (!isCyclicDep) {

    cmds.push('cd ' + modulePath);
    if (linksTo) {
      cmds.push('npm link ' + currentModule.linksTo.join(' '));
    }
    cmds.push('npm install');
    if (linkedBy) {
      cmds.push('npm link');
    }

  } else {

    // first: link current module with all dependencies except cyclicDep
    cmds.push('cd ' + modulePath);
    if (linksTo) {
      _.remove(currentModule.linksTo, function(links) {
        return links === cyclicModuleDep.name;
      });
      cmds.push('npm link ' + currentModule.linksTo.join(' '));
    }
    cmds.push('npm install');
    cmds.push('npm link');

    // second: install and link cyclicDep
    cmds.push('cd ' + moduleDependencies[cyclicModuleDep.name].path);
    if (cyclicModuleDep.linksTo.length > 0) {
      cmds.push('npm link ' + cyclicModuleDep.linksTo.join(' '));
    }
    cmds.push('npm install');
    if (cyclicModuleDep.linkedBy.length > 0) {
      cmds.push('npm link');
    }

    // third: link cyclicDep inside unresolvedDep
    cmds.push('cd ' + modulePath);
    cmds.push('npm link ' + cyclicModuleDep.name);

  }

  return cmds;
};


function dirExistsUnderParentDir(parentDir, dir) {
  return shell.test('-e', path.join(parentDir, dir));
}


/**
 * Create the necessary commands to link the current module's dependencies through symlinks
 * into its node_modules folder.
 *
 * @param currentModule
 * @param moduleDependencies
 * @param cyclicModuleDep
 * @param isCyclicDep
 * @returns {Array} array of executable commands to link the dependencies of the currentModule correctly
 */
function symlinkModule(currentModule, moduleDependencies, cyclicModuleDep, isCyclicDep) {
  var cmds = [];

  var linksTo = currentModule.linksTo.length > 0;

  // symlink is just
  // look for a node_modules for inside currentModule or create one
  // forEach linksTo
  //  create a symlink inside node_modules
  var modulePath = moduleDependencies[currentModule.name].path;

  if (!isCyclicDep) {

    cmds.push('cd ' + modulePath);
    dirExistsUnderParentDir(modulePath, 'node_modules');
    if (linksTo) {
      _.forEach(currentModule.linksTo, function(requiredModule) {
        cmds.push('ln -s ' + path.resolve(moduleDependencies[requiredModule] + ' ' + path.resolve(modulePath) + '/node_modules'));
      });
    }
    cmds.push('npm install');

  } else {

    // first: link current module with all dependencies except cyclicDep
    cmds.push('cd ' + modulePath);
    if (linksTo) {
      _.remove(currentModule.linksTo, function(links) {
        return links === cyclicModuleDep.name;
      });
      cmds.push('npm link ' + currentModule.linksTo.join(' '));
    }
    cmds.push('npm install');

    // second: install and link cyclicDep
    cmds.push('cd ' + moduleDependencies[cyclicModuleDep.name].path);
    if (cyclicModuleDep.linksTo.length > 0) {
      cmds.push('npm link ' + cyclicModuleDep.linksTo.join(' '));
    }
    cmds.push('npm install');

    // third: link cyclicDep inside unresolvedDep
    cmds.push('cd ' + modulePath);
    cmds.push('npm link ' + cyclicModuleDep.name);

  }

  return cmds;
};


/* ----------------------------- exports ----------------------------- */

module.exports = DependencyLinker;
