var CLI = require('./cli');
var constants = require("./constants");
program.version('parse-cli v'+constants.VERSION)
  .usage("[command] [options]")
var list = ['push',
'deploy',
'default',
'rollback',
'log',
'add',
'releases',
'run',
'develop',
'list']

list.forEach(function(e){
  program.on(e, function(){
    parse_root = CLI.find_parse_root();
    if (!parse_root) {
      process.exit(1);
    };
    output_file = process.stdout;
  })
})

program.command('push')
  .description("Deploys the current code to the given app.\n")
  .option("-d, --descritption [value]")
  .action(CLI.handle_push);

program.command('deploy')
  .description("Deploys the current code to the given app.\n")
  .option("-d, --descritption [value]")
  .action(CLI.handle_push);

program.command('default [app]')
  .description("Gets the default Parse App. If an argument is given\n\
                       sets the default Parse App.,\n")
  .action(CLI.handle_default)

program.command('rollback')
  .description("Rolls back the for the given app.\n")
  .option("-r, --release <n>","Provides an optional release to rollback to.  If no release, is provided, rolls back to the previous release.,\n")
  .action(CLI.handle_rollback)

program.command('log [app]')
  .description("Prints out recent log messages.\n")
  .option("-f", 'Tail mode')
  .option("-n <n>", 'Set number of lines')
  .option("-l, --level [value]", 'Log level *INFO | ERROR')
  .action(CLI.handle_tail)

program.command('add [name]')
  .description("Adds a new Parse App through an interactive interface.\n\
                       If an argument is given, the added application can \n\
                       also be referenced by that name.\n")
  .option("-l, --local", 'Adds to local.json instead')
  .action(CLI.handle_add)

program.command('releases')
  .description("Prints the releases the server knows about.\n")
  .action(CLI.handle_releases)

program.command('run [app]')
  .description("Starts the local development server.\n")
  .action(CLI.handle_run);

program.command('develop [app]')
  .description("Monitors for changes to source files and uploads updated\n\
                       files to Parse. This will also monitor the parse INFO\n\
                       log for any new log messages and write out updates to\n\
                       the terminal.  This requires an app to be provided, to\n\
                       avoid running develop on production apps accidently.\n")
  .action(CLI.handle_develop)

program.command('install [identifier] [target]')
  .description("Installs a module in the parse_module directory")
  .action(function(identifier, target){
    var Installer = require("parse-module/lib/Installer");
    var i = new Installer();
    i.install(identifier, target, function(){
    });
  })

program.command('new [app]')
  .description("Creates a Parse project in the current directory.\n\
                       An optional argument can be given to specify\n\
                       the directory to create.  Otherwise, the \"parse\"\n\
                       directory is created.\n")
  .action(CLI.handle_new)

program.command('list')
  .description("Prints the list of apps and aliases associated with this project.\n")
  .action(CLI.handle_list)

program.command('update')
  .description("Updates to the next verison.\n")
  .action(function(){
    require('child_process').exec('npm install -g '+constants.PKG_NAME, 
        function (error, stdout, stderr) {
          console.log(stdout);
          console.log(stderr);
          if (error !== null) {
            console.log(error);
          }
      });
  });

program.command('help')
  .description("Prints this help...")
  .action(program.help);

program.command("*")
  .action(function(cmd){
    console.log("Unknown command %s", cmd);
      program.help();
  })

program.parse(process.argv);