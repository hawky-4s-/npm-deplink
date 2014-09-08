'use strict';

var shell = require('shelljs'),
    path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    winston = require('winston'),
    npm = require('npm');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: true,
      handleExceptions: true,
      json: false
    })
  ]
});

/**
 * Create a new DependencyLinker instance.
 *
 * You may optionally provide a rootDirectory otherwise the env variable 'DEP_LINKER_ROOT' is
 * used or if it is not set, parent directory of the process is used.
 *
 * @param {String} rootDirectory
 */
function DependencyLinker(rootDirectory, options) {
  /*jshint -W069 */
  rootDirectory = rootDirectory || process.env['DEP_LINKER_ROOT'] || process.cwd() + '/..';
  this._rootDirectory = rootDirectory;

  options = options || {};
  this._loglevel = options.loglevel || 'info';
  logger.transports.console.level = this._loglevel;
}


module.exports = DependencyLinker;


DependencyLinker.prototype.link = function() {
  var dirs = this.getDirectories(this._rootDirectory);
};

/**
 * Retrieves all first level child directories using the given parent directory as starting point.
 * @param  {String} directory
 * @return {Array} array of child directories with prefixed parent directory
 */
DependencyLinker.prototype.getDirectories = function(directory) {
  logger.debug("Directory: " + directory);

  var parentDir = normalizeDir(directory);
  logger.debug("NormalizedDirectory: " + parentDir);

  var childDirs = fs.readdirSync(parentDir).filter(function(file) {
    var childDir = path.join(parentDir, file);
    return fs.statSync(childDir).isDirectory() && fs.existsSync(path.join(childDir, 'package.json'));
  });
  logger.debug("ChildDirs: " + childDirs);

  var normalizedDirs = [];
  _.forEach(childDirs, function(childDir) {
    normalizedDirs.push(path.join(parentDir, childDir));
  });
  logger.debug("NormalizedChildDirs: " + normalizedDirs);

  return normalizedDirs;
};


DependencyLinker.prototype.discoverDependenciesForProject = function(directory, callback) {
  // read package.json
  logger.debug("Discover dependencies for directory: " + directory);
  var pkgJson = path.join(directory, 'package.json');
  logger.debug("PathPkgJson: " + pkgJson);

      // devDependencies + dependencies
  var projectDependencies = null;
  fs.readFile(pkgJson, function(err, data) {
    if (err) {
      return callback(err, null);
    }
    callback(null, { path: directory, dependencies: JSON.parse(data) });
  });
};


DependencyLinker.prototype.discoverDependencies = function(rootDirectory, callback) {
  var self = this;
  var directories = this.getDirectories(rootDirectory);

  logger.debug("Discover from directories: " + directories);

  var dependencies = [];
  _.forEach(directories, function(projectDir) {

    logger.debug("ProjectDir: " + projectDir);
    self.discoverDependenciesForProject(projectDir, function(err, projectDeps) {
      if (err) {
        logger.warn(err);
        return;
      }

      logger.debug("ProjectDeps: ", projectDeps);
      dependencies.push(projectDeps);
      
    });
  });

  logger.debug("All Dependencies: " + dependencies);

  return dependencies;
};


var normalizeDir = function(directory) {
  return path.resolve(directory);
};