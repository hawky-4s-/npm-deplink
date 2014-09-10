module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  // project configuration
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    config: {
      sources: 'lib',
      tests: 'test',
      dist: 'dist'
    },

    jshint: {
      options: {
        jshintrc: true
      },
      src: [ 'index.js' ]
    },

    mochaTest: {
      test: {
        options: {
          reporter: 'spec',
          require: [
            './test/expect.js'
          ]
        },
        src: ['test/unit/**/*.js']
      },
      integrationTest: {
        options: {
          reporter: 'spec',
          require: [
            './test/expect.js'
          ]
        },
        src: ['test/integration/**/*.js']
      }
    },

    release: {
      options: {
        tagName: 'v<%= version %>',
        commitMessage: 'chore(project): release v<%= version %>',
        tagMessage: 'chore(project): tag v<%= version %>'
      }
    },

    watch: {
      test: {
        files: [ '<%= config.sources %>/**/*.js', '<%= config.tests %>/spec/**/*.js' ],
        tasks: [ 'test' ]
      }
    },

    jsdoc: {
      dist: {
        src: [ 'index.js' ],
        options: {
          destination: 'docs/api'
        }
      }
    }
  });

  // tasks

  grunt.registerTask('integration-test', [ 'mochaTest:integrationTest' ]);

  grunt.registerTask('test', [ 'mochaTest:test' ]);

  grunt.registerTask('auto-test', [ 'test', 'watch:test' ]);

  grunt.registerTask('default', [ 'jshint', 'test', 'jsdoc' ]);
};