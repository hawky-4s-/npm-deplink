'use strict';

function CommandFactory(options) {

  var logger = options.logger;

  function npmLink(dependencies) {
    var cmd;
    if (dependencies && dependencies.length > 0) {
      cmd = 'npm link ' + dependencies.join(' ');
    } else {
      cmd = 'npm link';
    }

    return cmd;
  };

  function npmInstall() {
    return 'npm install';
  }

  function cd(dir) {
    return 'cd ' + dir;
  }

  function mkDir(dir) {
    return 'mkdir -p ' + dir;
  }

  function link(source, dest, forceLink) {
    var params = '-s';
    if (forceLink) {
      logger.debug('Forcing link creation');
      params = params + 'f';
    }
    return 'ln ' + params + ' ' + source + ' ' + dest;
  }

  return {
    npmLink: npmLink,
    npmInstall: npmInstall,
    cd: cd,
    mkDir: mkDir,
    link: link
  };
}

module.exports = CommandFactory;