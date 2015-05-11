const spawn = require('child_process').spawn
    , path  = require('path')
    , fs    = require('fs')
    , after = require('after')
    , xtend = require('xtend')

function execute (exercise, opts) {
  if (!opts) opts = {}

  exercise.addSetup(setup)
  exercise.addProcessor(processor)


  // override if you want to mess with stdout
  exercise.getStdout = function (type, child) {
    // type == 'submission' || 'solution'
    return child.stdout
  }

  exercise.getSolutionFiles = function (callback) {
    var translated = path.join(this.dir, './solution_' + this.lang)
    fs.exists(translated, function (exists) {
      var solutionDir = exists ? translated : path.join(this.dir, './solution')

      fs.readdir(solutionDir, function (err, list) {
        if (err)
          return callback(err)

        list = list
          .filter(function (f) { return (/\.js$/).test(f) })
          .map(function (f) { return path.join(solutionDir, f)})

        callback(null, list)
      })
    }.bind(this))
  }

  return exercise

  function setup (mode, callback) {
    this.submission = this.args[0] // first arg obviously

    // default args, override if you want to pass special args to the
    // solution and/or submission, override this.setup to do this
    this.submissionArgs = Array.prototype.slice.call(1, this.args)
    this.solutionArgs   = Array.prototype.slice.call(1, this.args)

    // edit/override if you want to alter the child process environment
    this.env            = xtend(process.env)

    // set this.solution if your solution is elsewhere
    if (!this.solution) {
      var localisedSolutionPath = path.join(this.dir, './solution_' + this.lang + '/solution.js');
      this.solution = fs.existsSync(localisedSolutionPath) ? localisedSolutionPath : path.join(this.dir, './solution/solution.js')
    }

    process.nextTick(callback)
  }


  function kill () {
    ;[ this.submissionChild, this.solutionChild ].forEach(function (child) {
      if (child && typeof child.kill == 'function')
        child.kill()
    })

    setTimeout(function () {
      this.emit('executeEnd')
    }.bind(this), 10)
  }


  function processor (mode, callback) {
    var ended = after(mode == 'verify' ? 2 : 1, kill.bind(this))

    // backwards compat for workshops that use older custom setup functions
    if (!this.solutionCommand) this.solutionCommand = [ this.solution ].concat(this.solutionArgs)
    if (!this.submissionCommand) this.submissionCommand = [ this.submission ].concat(this.submissionArgs)

    this.submissionChild  = spawn(opts.exec || process.execPath, this.submissionCommand, { env: this.env })
    this.submissionStdout = this.getStdout('submission', this.submissionChild)

    setImmediate(function () { // give other processors a chance to overwrite stdout
      this.submissionStdout.on('end', ended)
    }.bind(this))

    if (mode == 'verify') {
      this.solutionChild  = spawn(opts.exec || process.execPath, this.solutionCommand, { env: this.env })
      this.solutionStdout = this.getStdout('solution', this.solutionChild)

      setImmediate(function () { // give other processors a chance to overwrite stdout
        this.solutionStdout.on('end', ended)
      }.bind(this))
    }

    process.nextTick(function () {
      callback(null, true)
    })
  }

}

module.exports = execute
