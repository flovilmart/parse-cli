var constants = require("./constants"),
  config_handler = require("./configHandler");
  parse = require("./parse"),
  request = require("request-sync"),
  fs = require('fs'),
  prompt = require('prompt'),
  path = require('path'),
  util = require('util'),
  getopt = require('posix-getopt'),
  fse = require('fs-extra'),
  _ = require('underscore'),
  program = require('commander')


var _write = process.stdout.write;

process.stdout.write = function(){
  var args = Array.prototype.slice.call( arguments, 0 );
  args = _.map(args, function(arg){
    return arg ? arg.toString('utf8') : '';
  })
  _write.call(this, util.format.apply(util, args));  
}

function download_and_save(url, dest_file, output_file) {
  var response = request(url);
  fs.writeFileSync(dest_file, response.body);
}

function sorted_naturally(iterable, is_descending){
  return iterable;
}

function get_default_target(){
  return '_default';
}

function getParseVersion(parse_root){
  return config_handler.version(parse_root, false);
}

function set_parse_version(parse_root, parse_version){
  return config_handler.version(parse_root, parse_version);
}

function server(){
  return 'https://api.parse.com/';
}

function check_script_version(version, output_file){
  output_file = output_file || process.stdout;
  var url = server()+'1/supported?version='+version;
  var respone = request(url);
  response = JSON.parse(response.body);
  if (response.error) {
    output_file.write('FATAL: %s\n', response['error']);
    return false;
  }else if(response.warning){
    output_file.write('WARNING: %s\n' , response['warning'])
  }
  return true;
}

function select_apps(server, callback){
  var schema = {
    properties: {
      email: {
        description: 'Email: ',
        required: true
      },
      password: {
        description: 'Password: ', 
        hidden: true,
        required: true
      }
    }
  };
  prompt.start();
  prompt.get(schema, function (err, result) {
    if (err) {
      console.log("\nCancelled...\n");
      return;
    }
    var headers = { "X-Parse-Email" : result.email,
                    "X-Parse-Password" : result.password };
    var response = request(server+"1/apps", {headers: headers});
    var app_list = JSON.parse(response.body);
    var display = Object.keys(app_list);
    var i = 1;
    display.forEach(function(appName){
      console.log(i+": "+appName);
      i++;
    });
    prompt.start();
    prompt.get({
      properties: {
          'appindex': {
            description: 'Select an App: ',
            required: true
          }
      }
    }, function(err, result){
      var select = parseInt(result['appindex']);
      callback(display[select-1], app_list[display[select-1]]);
    })
  });
}


function find_parse_root(output_file){
  output_file = output_file || process.stdout;
  var cpath = process.cwd();
  var config_path = path.join(cpath, constants.CONFIG_DIR, constants.GLOBAL_FILE);
  if(!fs.existsSync(config_path)){
    output_file.write("You should be run in a directory containing a Parse project\n");
  }else{
    return cpath;
  }
}

function parse_options(args, short_ops){
  var parser = new getopt.BasicParser(short_ops, args);
  var options = {};
  var option;
  var rArgs = [];
  while ((option = parser.getopt()) !== undefined) {
    options[option.option] = option.optarg || true;  

  }
  return [options, args[parser.optind()]];
}

function handle_cliversion(){
  output_file = output_file || process.stdout;
  output_file.write("parse-cli v%s\n", constants.VERSION)
}

function handle_push(){
  var output_file = output_file || process.stdout;

  var stage = get_default_target();
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    stage = arguments[0];
  }

  var description = opts.description;
  var handler = new parse.StageHandler(stage, server(), parse_root, output_file);
  if(!handler.valid()){
    return false;
  }
  old_version = getParseVersion(parse_root);
  handler.deploy(description, old_version,false,undefined, function(data){
      if (!data) {
        return false;
      }
      if (data && data['parseVersion'] && old_version === data['parseVersion']) {
        return;
      };
      if (!getParseVersion(parse_root) && data && data['parseVersion']) {
        set_parse_version(data['parseVersion']);
      }
  });
  
}

function handle_default(new_app){
  var output_file = output_file || process.stdout;
  
  apps = config_handler.get_info_for_apps(parse_root);
  if (apps.length == 0)
  {
    output_file.write('No apps are associated with this project. You can add some with parse add\n')
    return
  }
  if( apps['_default'] )
  {
    default_app = apps['_default'][constants.LINK]
  }
  else{
    default_app = None
  }

  if (!new_app){
    if (!default_app){
      output_file.write('No app is set as default app\n')
    }
    else{
      output_file.write('Current default app is %s\n' , default_app)
    }
  } 
  else{
    config_handler.set_default_app(parse_root, new_app, output_file)
  }
}

function handle_rollback(){
  output_file = output_file || process.stdout;
  var stage = get_default_target();
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    stage = arguments[0];
  }

  release = opts.release;
  handler = new parse.StageHandler(stage, server(), parse_root, output_file)
  if (! handler.valid()){
    return false;
  }
  handler.rollback(release)
}

function handle_list_apps(args, parse_root, output_file){
  output_file = output_file || process.stdout;
  var opts = arguments[arguments.length - 1];
  apps = config_handler.get_info_for_apps(parse_root);
  if(!apps.length)
  {
    output_file.write('No apps are associated with this project. You can add some with parse add\n')
    return
  }
  output_file.write('Associated apps are:\n')
  config_handler.print_list_of_apps(apps, output_file)
}

function handle_new(){
  output_file = output_file || process.stdout;
  var  directory = 'parse'
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    directory = arguments[0];
  }
  var dest_dir = path.join(process.cwd(), directory);
  var as = args.slice(2);
  if (as.length > 0) {
    dest_dir = path.join(process.cwd(), as[0]);
  }

  config_file = path.join(dest_dir, constants.CONFIG_DIR, constants.GLOBAL_FILE)
  config_dir = path.join(dest_dir, constants.CONFIG_DIR)
  if (fs.existsSync(config_file) || fs.existsSync(config_dir)) {
    output_file.write("A Parse project already exists in directory %s\n", dest_dir)
    return false;
  }else{
    var templates_path = path.join(__dirname, "../", constants.TEMPLATES);
    fse.copySync(templates_path, dest_dir);
    if( argv.length > 2) {
          directory = argv[2]
        } 
        var app_path = path.join(process.cwd(), directory)
        handle_add([], app_path, true, function(err){
          if (err) {
            console.log(err);
          }
        });
  }
  return true;
}

function handle_generate(){
  output_file = output_file || process.stdout;
}

function handle_list(){
  var opts = arguments[arguments.length - 1];
  apps = config_handler.get_info_for_apps(parse_root)
  if (apps.length == 0){
    process.stdout.write('No apps are associated with this project. You can add some with parse add\n')
  } 
  process.stdout.write('Associated apps are:\n')
  config_handler.print_list_of_apps(apps, output_file)
}

function handle_add(){
  var alias;
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    alias = arguments[0];
  };
  local = opts.l;
  console.log(alias, local);
  select_apps(server(), function(name, keys){
    if (!name) {
      return;
    };
    var alias_name;
    var err = config_handler.add_app(parse_root, name, keys, alias_name, !local, output_file);
    if(!err && make_default){
      err = config_handler.add_alias(parse_root, name, '_default', !local,
                                    process.stdout)
    }
    callback(err);
  });
}

function handle_tail(){
  var output_file = output_file || process.stdout;
  var iterations = iterations || undefined;
  var stage = get_default_target();
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    stage = arguments[0];
  }
  var n = opts.N;
  var f =  opts.F;
  var level = opts.level;
  var handler = new parse.StageHandler(stage, server(), parse_root, output_file)
  if(! handler.valid()){
    return false;
  }

  handler.tail(n, f, level, iterations)
}

function handle_releases(args, parse_root, output_file){
  output_file = output_file || process.stdout;
}

function handle_update(args, output_file){
  output_file = output_file || process.stdout;
}

function handle_run(appName){
    var Server = require("parse-develop/lib/ParseServer");
    s = new Server(appName);
    s.start();
}

function handle_develop(appName, options){
  output_file = output_file || process.stdout;
  var time_between_deploys;// = time_between_deploys || undefined;
  var num_iterations;// = num_iterations || undefined;
  
  if (typeof appName !== 'string'){
      output_file.write("An app must be provided to develop\n")
      return 1
  }
  var always_get_version_from_server// = always_get_version_from_server || false;
  stage = arguments[0]
  handler = new parse.StageHandler(stage, server(), parse_root, output_file);
  if (!handler.valid()) {
    return;
  };
  handler.develop(function(){
    return getParseVersion(parse_root);
  }, function(version){
    return set_parse_version(parse_root, version);
  }, time_between_deploys, num_iterations, always_get_version_from_server)

}

function get_all_versions(){
  parse_root = parse_root || find_parse_root();
  output_file = output_file || process.stdout;
  var target = get_default_target()
  var keys = config_handler.get_keys_for_app(parse_root, target)
  client = new parse.ParseHTTPClient(server(), keys[constants.APPLICATION_ID], keys[constants.MASTER_KEY]);
  return client.get('1/cli/versions').body;
}

function get_all_js_sdks(parse_root, output_file){
  output_file = output_file || process.stdout;
}

function handle_jssdk(args, parse_root, output_file){
  output_file = output_file || process.stdout;
}

program.version('parse-cli v'+constants.VERSION)
  .usage("[command] [options]")
var list = ['push',
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
    parse_root = find_parse_root();
    if (!parse_root) {
      process.exit(1);
    };
    output_file = process.stdout;
  })
})

program.command('push')
  .description("Deploys the current code to the given app.\n")
  .action(handle_push);

program.command('default [app]')
  .description("Gets the default Parse App. If an argument is given\n\
                       sets the default Parse App.,\n")
  .action(handle_default)

program.command('rollback')
  .description("Rolls back the for the given app.\n")
  .option("-r, --release <n>","Provides an optional release to rollback to.  If no release, is provided, rolls back to the previous release.,\n")
  .action(handle_rollback)

program.command('log [app]')
  .description("Prints out recent log messages.\n")
  .option("-f", 'Tail mode')
  .option("-n <n>", 'Set number of lines')
  .option("-l, --level [value]", 'Log level *INFO | ERROR')
  .action(handle_tail)

program.command('add [name]')
  .description("Adds a new Parse App through an interactive interface.\n\
                       If an argument is given, the added application can \n\
                       also be referenced by that name.\n")
  .option("-l, --local", 'Adds to local.json instead')
  .action(handle_add)

program.command('releases')
  .description("Prints the releases the server knows about.\n")
  .action(handle_releases)

program.command('run [app]')
  .description("Starts the local development server.\n")
  .action(handle_run);

program.command('develop [app]')
  .description("Monitors for changes to source files and uploads updated\n\
                       files to Parse. This will also monitor the parse INFO\n\
                       log for any new log messages and write out updates to\n\
                       the terminal.  This requires an app to be provided, to\n\
                       avoid running develop on production apps accidently.\n")
  .action(handle_develop)

program.command('new [app]')
  .description("Creates a Parse project in the current directory.\n\
                       An optional argument can be given to specify\n\
                       the directory to create.  Otherwise, the \"parse\"\n\
                       directory is created.\n")
  .action(handle_new)

program.command('list')
  .description("Prints the list of apps and aliases associated with this project.\n")
  .action(handle_list)

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