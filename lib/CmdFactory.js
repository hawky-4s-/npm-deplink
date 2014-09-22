'use strict';

function CommandFactory(options) {

  this.options = options || {};

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

  return {
    npmLink: npmLink,
    npmInstall: npmInstall,
    cd: cd
  };
}

module.exports = CommandFactory;