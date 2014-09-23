'use strict';

var shell = require('shelljs'),
    path = require('path'),
    _ = require('lodash'),
    winston = require('winston'),
    DependencyResolver = require('./DepResolver'),
    CommandFactory = require('./CmdFactory');

var DRY_RUN = false;
var LOG_JSON = false;

var NODE_MODULES = './node_modules';

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
  rootDirectory = rootDirectory || process.env['DEPLINK_ROOT'] || process.cwd();
  this._rootDirectory = rootDirectory;
  options = options || {};

  this.loglevel = options.logLevel || 'info';
  this.verbose = options.verbose || false;
  this.useSymlinks = options.symlinks || false;

  DRY_RUN = options.dryRun || false;
  LOG_JSON = options.logJson || false;
  logger.transports.console.level = this.loglevel;

  shell.config.silent = !this.verbose;
  shell.config.fatal = options.haltOnErrors || true;

  this.dependencyResolver = new DependencyResolver(rootDirectory, options);
  this.cmdFactory = new CommandFactory(options);
}


DependencyLinker.prototype.link = function(customCmds, callback) {
  var self = this;

  this.dependencyResolver.discoverDependencies(this._rootDirectory, function(err, result) {
    if (err) {
      return callback(err);
    }

    var moduleDependencies = result;
    var linkFunction = self.useSymlinks ? self.symlinkModule : self.npmlinkModule;
    var cmds = self.dependencyResolver.analyzeDependencies(moduleDependencies, customCmds, linkFunction);

    logger.debug("Commands: ", cmds);

    self.executeCmds(self._rootDirectory, cmds);

    return callback(undefined, cmds);
  });
};


DependencyLinker.prototype.executeCmds = function(workingDir, cmds) {
  logger.debug('currentStartDir: ', shell.pwd());

  // start with workingDir
  logger.debug('workingDir: ', path.resolve(workingDir));
  shell.pushd(path.resolve(workingDir));

  _.forEach(cmds, function(cmd) {
    if (!DRY_RUN) {
      logger.debug("Executing cmd: " + cmd);

      var cmdParams = cmd.split(' ');

      // if cmd is a change directory operation && current dir is not the workingDir
      if (cmdParams.indexOf('cd') === 0) {
        var cwd = shell.pwd();

        logger.debug('cwd: ', cwd);
        logger.debug('workingDir: ', workingDir)

        if (cwd !== workingDir) {
          logger.debug('Popping dir');
          shell.popd();
        }

        shell.pushd(cmd.substring(3));

        logger.debug('cwd: ', shell.pwd());

      } else if (cmdParams.indexOf('ln') === 0) {
        // we have to link it
        if (!dirExistsUnderParentDir(shell.pwd(), NODE_MODULES)) {
          shell.mkdir(NODE_MODULES);
        }
        shell.ln(cmdParams[1], cmdParams[2], cmdParams[3]);
      } else {
        // just execute it
        shell.exec(cmd);
      }
    } else {
      logger.info('Cmd: ', cmd);
    }
  });

  // finish inside starting directory
  shell.popd();

  logger.debug('currentEndDir: ', shell.pwd());

};


/**
 * Create the necessary commands to link the current module's dependencies through 'npm link'.
 *
 * @param cmdFactory
 * @param currentModule
 * @param moduleDependencies
 * @param cyclicDependency
 * @param hasCyclicDep
 * @returns {Array} array of executable commands to link the dependencies of the currentModule correctly
 */
DependencyLinker.prototype.npmlinkModule = function(cmdFactory, currentModule, moduleDependencies, cyclicDependency, hasCyclicDep) {
  var commands = [];

  var dependsOn = currentModule.dependsOn.length > 0;
  var referencedBy = currentModule.referencedBy.length > 0;
  var modulePath = moduleDependencies[currentModule.name].path;

  logger.debug('currentModule: ', currentModule);
  if (!hasCyclicDep) {
    logger.debug('npmLinkModule: - > no cyclic dep <-');

    commands.push(cmdFactory.cd(modulePath));
    if (dependsOn) {
      commands.push(cmdFactory.npmLink(currentModule.dependsOn));
    }
    commands.push(cmdFactory.npmInstall());
    if (referencedBy) {
      commands.push(cmdFactory.npmLink());
    }

  } else {
    logger.debug('npmLinkModule: -> cyclic dep <-');


    // first: link current module with all dependencies except cyclicDep
    commands.push(cmdFactory.cd(modulePath));
    if (dependsOn) {
      // remove the cyclic dependency and create npm link for the rest
      _.remove(currentModule.dependsOn, function(dependency) {
        return dependency === cyclicDependency.name;
      });

      if (currentModule.dependsOn.length > 0) {
        commands.push(cmdFactory.npmLink(currentModule.dependsOn));
      }
    }
    commands.push(cmdFactory.npmInstall());
    commands.push(cmdFactory.npmLink());

    // second: install and link cyclicDep
    commands.push(cmdFactory.cd(moduleDependencies[cyclicDependency.name].path))
    if (cyclicDependency.dependsOn.length > 0) {
      commands.push(cmdFactory.npmLink(cyclicDependency.dependsOn))
    }
    commands.push(cmdFactory.npmInstall());
    if (cyclicDependency.referencedBy.length > 0) {
      commands.push(cmdFactory.npmLink());
    }

    // third: link cyclicDep inside unresolvedDep
    commands.push(cmdFactory.cd(modulePath));
    commands.push(cmdFactory.npmLink( [cyclicDependency.name] ));
  }

  return commands;
};


function dirExistsUnderParentDir(parentDir, dir) {
  return shell.test('-e', path.join(parentDir, dir));
}


/**
 * Create the necessary commands to link the current module's dependencies through symlinks
 * into its node_modules folder.
 *
 * @param cmdFactory
 * @param currentModule
 * @param moduleDependencies
 * @param cyclicDependency
 * @param hasCyclicDep
 * @returns {Array} array of executable commands to link the dependencies of the currentModule correctly
 */
DependencyLinker.prototype.symlinkModule = function(cmdFactory, currentModule, moduleDependencies, cyclicDependency, hasCyclicDep) {
  var commands = [];

  var dependsOn = currentModule.dependsOn.length > 0;

  var modulePath = moduleDependencies[currentModule.name].path;

  commands.push('cd ' + modulePath);
  dirExistsUnderParentDir(modulePath, NODE_MODULES);
  if (dependsOn) {
    _.forEach(currentModule.dependsOn, function(requiredModule) {
      commands.push('ln -s ' + path.join(moduleDependencies[requiredModule].path) + ' ' + path.join(NODE_MODULES, requiredModule));
    });
  }
  commands.push('npm install');

  return commands;
};


/* ----------------------------- exports ----------------------------- */

module.exports = DependencyLinker;
